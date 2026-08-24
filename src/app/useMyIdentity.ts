/**
 * Who the signed-in rider is, visually and by name — the one place the app answers "how do I
 * show ME".
 *
 * The name chain (nickname → first + last → neutral fallback) is the client source-of-truth
 * doc's rule, and it used to live inline in AppDrawer. It is here so the drawer, the header
 * avatar and the account page cannot drift apart, which is the exact failure that doc warns
 * about.
 *
 * `localSelection` is this device's temporary avatar pick (store/userIdentityStore.ts). It is
 * only ever the VIEWER's own — no other rider's pick exists on this device to show.
 */

import { useAuth } from "../auth/AuthContext";
import type { LocalVisualSelection, UserVisualAsset } from "../lib/user-identity";
import { getLocalIdentity, useUserIdentityStore } from "../store/userIdentityStore";

export interface MyIdentity {
  signedIn: boolean;
  userId: number | null;
  /** "Guest" when signed out, else nickname, else "First Last", else "Rider". */
  displayName: string;
  /** The server-side avatar choice. Absent until the server carries one. */
  avatar: UserVisualAsset | null | undefined;
  cover: UserVisualAsset | null | undefined;
  localAvatar: LocalVisualSelection | null;
  localCover: LocalVisualSelection | null;
  /** Stable hash input for the placeholder colour — the id, not the name, so editing a
   * profile does not change the colour of the initial. */
  seed: string | null;
}

export function useMyIdentity(): MyIdentity {
  const { status, profile } = useAuth();
  const byUser = useUserIdentityStore((s) => s.byUser);

  const signedIn = status === "signed-in";
  const userId = profile?.id ?? null;
  const local = getLocalIdentity(byUser, userId);

  const fullName = [profile?.firstName, profile?.lastName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  return {
    signedIn,
    userId,
    displayName: signedIn ? profile?.nickname?.trim() || fullName || "Rider" : "Guest",
    avatar: profile?.avatar,
    cover: profile?.cover,
    localAvatar: local.avatar,
    localCover: local.cover,
    seed: userId != null ? String(userId) : null,
  };
}
