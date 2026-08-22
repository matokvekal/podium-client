// The real route shape for an event — matches the server's POST/GET /events/:eventId/route
// (elnino-server/src/modules/routes/routes.schemas.ts) exactly. This used to live in
// lib/mock-results.ts alongside the fabricated route data; the mock is gone (see BUGS.md
// "Remove fake/mock riders" / "Never show mock/fake route"), so the type has a real home.
//
// No `splits` field: that was a mock-only multi-stage-race concept the real route endpoint
// never returns (it was written but never read anywhere in the client).

export interface EventRoute {
  /** [lat, lng] pairs — same ordering as the server's routePointSchema. */
  points: [number, number][];
  distanceKm: number;
  elevationM: number | null;
}
