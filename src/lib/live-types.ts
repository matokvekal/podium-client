// Shared shape for one rider's live position, returned by GET /events/:eventId/live
// (elnino-server's getLiveHandler → { riders: LiveRider[], paused: boolean }).
//
// Pulled out of app/LiveTracking.tsx (which used to own it) because that file is now just a
// compact "this event is live" summary + link — the real consumers are LiveRidersMap.tsx (the
// map itself) and pages/LiveEventPage.tsx (the full live page), and both need it independent
// of that summary component.
//
// lat/lng/recordedAt/distanceKm are nullable to match the server's LiveRider type exactly
// (event.service.ts) — a rider can be listed with no fix yet in edge cases (e.g. a location
// row race), and the UI must show "no position yet" rather than crash or draw a fake (0,0).
import type { UserVisualAsset } from "./user-identity";

export interface LiveRider {
  participantId: number;
  name: string;
  /** Real account's users.avatar_url (a Google profile photo), or null for a manual/
   * account-less rider or an account that never signed in with Google. */
  avatarUrl: string | null;
  /** Chosen visual identity, once the server can carry one. Optional and absent from every
   * response today; `avatarUrl` above stays the fallback. See lib/user-identity.ts. */
  avatar?: UserVisualAsset | null;
  bib: string | null;
  lat: number | null;
  lng: number | null;
  recordedAt: string | null;
  emergency: boolean;
  distanceKm: number | null;
}
