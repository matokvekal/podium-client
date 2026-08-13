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
import { apiRequest, SESSION_EXPIRED_EVENT } from "../lib/api-client";
import { clearTokens, hasSession, saveTokens } from "../lib/auth-storage";
import { forgetGoogleSession } from "./google-signin";

export interface Profile {
  id: number;
  role: "RIDER" | "COMMISSAIRE";
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  emergencyPhone: string | null;
  requiresProfile: boolean;
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
  /** ⚠ TEMPORARY developer shortcut — delete before production. See README.md. */
  signInAsDevUser(role: Profile["role"]): Promise<void>;
  updateProfile(input: Partial<Omit<Profile, "id" | "role" | "requiresProfile">>): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (hasSession() ? "loading" : "signed-out"));
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async () => {
    const me = await apiRequest<Profile>("/users/me");
    setProfile(me);
    setStatus("signed-in");
  }, []);

  // Cold start with a stored session: find out who this is before rendering anything else.
  useEffect(() => {
    if (!hasSession()) return;
    loadProfile().catch(() => {
      clearTokens();
      setProfile(null);
      setStatus("signed-out");
    });
  }, [loadProfile]);

  // The API client fires this when a refresh is refused — the session is gone for good.
  useEffect(() => {
    function onExpired() {
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

  // ⚠⚠ TEMPORARY DEVELOPMENT AID — DELETE BEFORE PRODUCTION (see README.md).
  // Nothing special happens here: the server hands back the same real token pair as any
  // other sign-in, so the session that follows is indistinguishable from a genuine one.
  const signInAsDevUser = useCallback(
    async (role: Profile["role"]) => {
      const auth = await apiRequest<AuthResponse>("/auth/dev-login", {
        method: "POST",
        body: { role, key: "default" },
        anonymous: true,
      });
      await completeSignIn(auth);
    },
    [completeSignIn],
  );

  const updateProfile = useCallback(
    async (input: Partial<Omit<Profile, "id" | "role" | "requiresProfile">>) => {
      const updated = await apiRequest<Profile>("/users/me", { method: "PATCH", body: input });
      setProfile(updated);
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Best effort: revoking the session server-side is right, but a rider on a mountain
    // with no signal still gets signed out locally.
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearTokens();
    forgetGoogleSession();
    setProfile(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      requiresProfile: profile?.requiresProfile ?? false,
      signInWithGoogle,
      verifySmsCode,
      signInAsDevUser,
      updateProfile,
      signOut,
    }),
    [status, profile, signInWithGoogle, verifySmsCode, signInAsDevUser, updateProfile, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
