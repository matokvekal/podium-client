/**
 * The owner-identity half of an event's cover, in one place.
 *
 * Every surface that draws a cover (EventCard, EventTile, EventDetailPage) needs the same two
 * facts: what the server says the owner's cover is, and — only when the viewer IS that owner —
 * what they have picked on this device but cannot sync yet. Working that out per page is
 * exactly the per-page identity rule the client's source-of-truth doc rules out, so it lives
 * here and each caller passes the result straight to eventCoverBackground().
 *
 * The "only for the owner" condition is not a permission check, it is a truth check: this
 * device only holds a local pick for the signed-in rider. Nobody else's pick exists here to
 * show, and inventing one would be fabricating another user's data.
 */

import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import type { UserVisualAsset } from "../lib/user-identity";
import { getLocalIdentity, useUserIdentityStore } from "../store/userIdentityStore";
import type { EventCoverOptions } from "./event-visuals";

export function useOwnerCover(
  ownerId: number | null | undefined,
  ownerCover: UserVisualAsset | null | undefined,
): EventCoverOptions {
  const { profile } = useAuth();
  const byUser = useUserIdentityStore((s) => s.byUser);
  const viewerId = profile?.id ?? null;

  return useMemo(() => {
    const viewerIsOwner = viewerId != null && ownerId != null && viewerId === ownerId;
    return {
      ownerId: ownerId ?? null,
      ownerCover,
      localCover: viewerIsOwner ? getLocalIdentity(byUser, viewerId).cover : null,
    };
  }, [viewerId, ownerId, ownerCover, byUser]);
}
