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
  /** Per-point elevation in metres, one entry per point in `points`, null where a point had no
   * readable value. Absent/null when the route carries no elevation at all — which is the case
   * for every route saved before the server started keeping the series, and for any GPX that
   * never had <ele> tags.
   *
   * Additive and optional on purpose: `points` is a frozen response shape, so the series rides
   * alongside it rather than widening the tuple. Drives the elevation profile under the map
   * (app/ElevationProfile.tsx); when it is missing the profile simply does not render. */
  elevations?: (number | null)[] | null;
}
