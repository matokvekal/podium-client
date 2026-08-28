/**
 * The organizer-AVATAR twin of useOwnerCover — the one missing piece that made an organizer's
 * chosen avatar show on the account page and the app header but NOT on their own event's card
 * / detail page (those call sites passed `identity` + `avatarUrl` but never `localSelection`,
 * so this device's pick was ignored).
 *
 * Same rule as useOwnerCover: pass through the server's data as-is, and add this device's
 * local pick ONLY when the viewer IS the owner (that is the only pick this device can know).
 * Returns exactly the props <Avatar> takes, so a call site is `<Avatar {...props} />`.
 */

import { useAuth } from "../auth/AuthContext";
import type { LocalVisualSelection, UserVisualAsset } from "../lib/user-identity";
import { getLocalIdentity, useUserIdentityStore } from "../store/userIdentityStore";

export interface OwnerAvatarProps {
  avatarUrl: string | null | undefined;
  identity: UserVisualAsset | null | undefined;
  localSelection: LocalVisualSelection | null;
  seed: string | null;
}

export function useOwnerAvatar(
  ownerId: number | null | undefined,
  ownerAvatarUrl: string | null | undefined,
  ownerAvatar: UserVisualAsset | null | undefined,
): OwnerAvatarProps {
  const { profile } = useAuth();
  const byUser = useUserIdentityStore((s) => s.byUser);
  const viewerId = profile?.id ?? null;
  const viewerIsOwner = viewerId != null && ownerId != null && viewerId === ownerId;

  return {
    avatarUrl: ownerAvatarUrl,
    identity: ownerAvatar,
    localSelection: viewerIsOwner ? getLocalIdentity(byUser, viewerId).avatar : null,
    seed: ownerId != null ? String(ownerId) : null,
  };
}
