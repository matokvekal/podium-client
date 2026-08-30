// Who is signed in, for the whole app.
//
// The server issues a 15-minute access token and a rotating 30-day refresh token; the API
// client handles the rotation. This context only answers "is there a rider here, and do we
// know enough about them to let them in".

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, apiRequest, SESSION_EXPIRED_EVENT } from "../lib/api-client";
import {
  clearProfile,
  clearTokens,
  getProfile,
  hasSession,
  saveProfile,
  saveTokens,
} from "../lib/auth-storage";
import { clearLocalUserData } from "../lib/logout-cleanup";
import type { UserVisualAsset } from "../lib/user-identity";
import { useEventsStore } from "../store/eventsStore";
import { reconcileUserIdentity } from "../store/userIdentityStore";
import { forgetGoogleSession } from "./google-signin";

export interface Profile {
  id: number;
  role: "RIDER" | "COMMISSAIRE";
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  emergencyPhone: string | null;
  requiresProfile: boolean;
  /**
   * The Google profile photo, straight from the sign-in token — the same flat field every
   * event/participant endpoint already sends for OTHER people (see EventOwner.avatarUrl in
   * lib/local-db.ts). Optional because the server does not populate `users.avatar_url` on the
   * /users/me response yet (plan/server-tasks.md §1); null for a rider who signed in another
   * way. Sits BELOW a chosen avatar/preset in the resolution chain — see lib/user-identity.ts.
   */
  avatarUrl?: string | null;
  /**
   * This rider's own avatar and cover (lib/user-identity.ts). Optional because GET /users/me
   * does not send them yet — and the client must not require them: a profile without these
   * keys is a perfectly valid profile, and every surface falls back to what it shows today.
   *
   * Their PRESENCE (even as null) is also how the app detects that the server supports the
   * feature at all — see serverSupportsVisualIdentity. Until then the account page persists a
   * pick on this device only, and says so.
   */
  avatar?: UserVisualAsset | null;
  cover?: UserVisualAsset | null;
  /**
   * Per-user plan limits, resolved server-side and sent on every real GET /users/me response.
   * The client only renders/UX-gates against these — the server enforces the real limits. See
   * lib/entitlements.ts. Optional because a cached v1 profile / an offline cold start lacks
   * them, in which case lib/entitlements.ts falls back to FALLBACK_LIMITS.
   */
  entitlements?: {
    maxEventsPerWeek: number;
    maxParticipantsPerEvent: number;
    maxGroupsPerEvent: number;
  };
  /** This rider's own recent usage against the limits above — `eventsThisWeek` counts events
   *  they created in the last 7 days. Same "present on a real response, absent on a cached v1
   *  profile" rule as `entitlements`. */
  usage?: {
    eventsThisWeek: number;
    teamsOwned: number;
  };
}

interface AuthResponse {
  user: { id: number; role: Profile["role"] };
  accessToken: string;
  refreshToken: string;
  requiresProfile: boolean;
}

export type AuthStatus = "loading" | "signed-in" | "signed-out";

interface AuthContextValue {
  status: AuthStatus;
  profile: Profile | null;
  /** True until firstName, lastName and nickname are all set. emergencyPhone is optional. */
  requiresProfile: boolean;
  signInWithGoogle(idToken: string): Promise<void>;
  verifySmsCode(challengeId: number, code: string): Promise<void>;
  updateProfile(input: Partial<Omit<Profile, "id" | "role" | "requiresProfile">>): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // A cached profile lets a cold start with no network still show who is signed in, instead
  // of forcing a re-login the instant the server is unreachable — see the cold-start effect
  // below, and plan/05-auth-jwt.md's "never clear the session on a network error" rule.
  const [profile, setProfile] = useState<Profile | null>(() => getProfile<Profile>());
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (!hasSession()) return "signed-out";
    return getProfile<Profile>() ? "signed-in" : "loading";
  });

  const loadProfile = useCallback(async () => {
    const me = await apiRequest<Profile>("/users/me");
    saveProfile(me);
    setProfile(me);
    setStatus("signed-in");
    // Once the server holds this rider's avatar/cover, the temporary on-device copy is
    // redundant — server data wins and the local value is dropped. A no-op today, because
    // /users/me sends neither field. See store/userIdentityStore.ts.
    reconcileUserIdentity(me.id, me);
  }, []);

  // Cold start with a stored session: refresh who this is. A cached profile is already
  // showing (see the initializers above), so this only needs to upgrade or correct that —
  // never wipe the session because the server happened to be unreachable.
  useEffect(() => {
    if (!hasSession()) return;
    loadProfile().catch((err: unknown) => {
      const sessionRejected = err instanceof ApiError && !err.isOffline && err.status === 401;
      if (sessionRejected) {
        clearTokens();
        clearProfile();
        setProfile(null);
        setStatus("signed-out");
      } else if (!getProfile<Profile>()) {
        // Nothing cached to fall back to and the server didn't actually reject us — keep the
        // tokens (a reconnect can still recover this session) but there is no profile to show.
        setStatus("signed-out");
      }
      // Otherwise: a cached profile is already on screen and the session is untouched. The
      // offline banner in AppShell explains why data may be stale.
    });
  }, [loadProfile]);

  // The API client fires this when a refresh is refused — the session is gone for good. Same
  // full local reset as an explicit sign-out: the session is dead either way, so no user data
  // should be left for whoever logs in next. Tokens were already cleared by the API client.
  useEffect(() => {
    function onExpired() {
      clearProfile();
      useEventsStore.getState().clearMyRides();
      void clearLocalUserData()
        .catch(() => undefined)
        .finally(() => {
          if (typeof window !== "undefined") window.location.replace("/login");
        });
      setProfile(null);
      setStatus("signed-out");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const completeSignIn = useCallback(
    async (auth: AuthResponse) => {
      saveTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
      await loadProfile();
    },
    [loadProfile],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const auth = await apiRequest<AuthResponse>("/auth/google", {
        method: "POST",
        body: { idToken },
        anonymous: true,
      });
      await completeSignIn(auth);
    },
    [completeSignIn],
  );

  const verifySmsCode = useCallback(
    async (challengeId: number, code: string) => {
      const auth = await apiRequest<AuthResponse>("/auth/sms/verify", {
        method: "POST",
        body: { challengeId, code },
        anonymous: true,
      });
      await completeSignIn(auth);
    },
    [completeSignIn],
  );

  const updateProfile = useCallback(
    async (input: Partial<Omit<Profile, "id" | "role" | "requiresProfile">>) => {
      const updated = await apiRequest<Profile>("/users/me", { method: "PATCH", body: input });
      saveProfile(updated);
      setProfile(updated);
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Full local reset — see lib/logout-cleanup.ts. Every step is best-effort and independently
    // guarded: the user ends up logged out even if one storage clear throws.

    // 1. Revoke the session server-side. A rider on a mountain with no signal still gets
    //    signed out locally.
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);

    // 2-3. Live geolocation watchers, poll loops and timers all belong to mounted components;
    //      the hard navigation in step 9 unmounts everything and their effect cleanups run.

    // 4. Auth / session state.
    clearTokens();
    clearProfile();
    forgetGoogleSession();
    // In-memory My Rides too, so nothing flashes before the reload.
    useEventsStore.getState().clearMyRides();

    // 5-7. Persisted Zustand stores, the IndexedDB ride cache, and the transient session flags
    //      — only keys this app owns (podium.* / elnino.*).
    await clearLocalUserData().catch(() => undefined);

    // 8. Cookies: this app stores nothing in cookies (tokens are in localStorage); Google's
    //    own cookies are deliberately left untouched.

    setProfile(null);
    setStatus("signed-out");

    // 9. Hard navigation to the start screen. Discards ALL in-memory state (Zustand stores,
    //    timers, watchers, subscriptions) so the next login — same tab or not — starts clean.
    if (typeof window !== "undefined") window.location.replace("/login");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      requiresProfile: profile?.requiresProfile ?? false,
      signInWithGoogle,
      verifySmsCode,
      updateProfile,
      signOut,
    }),
    [status, profile, signInWithGoogle, verifySmsCode, updateProfile, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
