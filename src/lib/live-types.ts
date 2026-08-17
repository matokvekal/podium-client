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
export interface LiveRider {
  participantId: number;
  name: string;
  bib: string | null;
  lat: number | null;
  lng: number | null;
  recordedAt: string | null;
  emergency: boolean;
  distanceKm: number | null;
}
