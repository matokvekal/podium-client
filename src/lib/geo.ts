// Client-side geometry helpers for the live map — mirrors elnino-server/src/lib/geo.ts's
// haversine formula exactly, but on [lat, lng] tuples (this codebase's point convention on
// the client, e.g. RouteMap.tsx/LiveRidersMap.tsx) rather than that file's {lat,lng} objects.
// Deliberate small duplication across the two separate repos, not shared code.

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two [lat, lng] points, in kilometres. */
export function haversineDistanceKm(a: [number, number], b: [number, number]): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Cumulative distance (km) from the first point up to and including each point. Same length
 * as `points`, index 0 is always 0. Used to find how far along a route a rider's own
 * server-reported `distanceKm` places them, for the "traveled portion of the track" overlay. */
export function cumulativeDistanceKm(points: readonly [number, number][]): number[] {
  const result: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversineDistanceKm(points[i - 1], points[i]);
    result.push(total);
  }
  return result;
}

/**
 * Nearest point ON the route polyline to `target` — a real perpendicular projection onto the
 * closest segment, NOT "the nearest vertex" and NOT a straight line from the start. Used to
 * split the route into "already travelled" and "still ahead" for the live progress overlay.
 *
 * Returns the index of the segment's START vertex and the projected [lat, lng] on that
 * segment, so the caller can build:
 *   travelled = [...points.slice(0, index + 1), point]
 *   ahead     = [point, ...points.slice(index + 1)]
 *
 * The projection maths run in a local equirectangular approximation (longitude scaled by
 * cos(lat)) — accurate at the scale of one route segment, which is all it is used for.
 */
export function nearestPointOnRoute(
  points: readonly [number, number][],
  target: [number, number],
): { index: number; point: [number, number] } {
  if (points.length === 0) return { index: -1, point: target };
  if (points.length === 1) return { index: 0, point: points[0] };

  const latScale = Math.cos(toRadians(target[0]));
  const tx = target[1] * latScale;
  const ty = target[0];

  let bestIndex = 0;
  let bestPoint: [number, number] = points[0];
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][1] * latScale;
    const ay = points[i][0];
    const bx = points[i + 1][1] * latScale;
    const by = points[i + 1][0];

    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((tx - ax) * abx + (ty - ay) * aby) / lenSq)) : 0;

    // Interpolate the real lat/lng directly (linear over one short segment is fine).
    const lat = points[i][0] + t * (points[i + 1][0] - points[i][0]);
    const lng = points[i][1] + t * (points[i + 1][1] - points[i][1]);

    const px = lng * latScale;
    const dx = tx - px;
    const dy = ty - lat;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
      bestPoint = [lat, lng];
    }
  }

  return { index: bestIndex, point: bestPoint };
}

/** Index of the route point nearest to `targetKm` along the cumulative-distance array — the
 * "how far into the route has this rider gotten" lookup, via a since-`cumulative` is
 * monotonically non-decreasing. Returns the last index if `targetKm` is past the route's end
 * (rider has gone further than the recorded track, or the track is a loop). */
export function nearestIndexForDistance(cumulative: readonly number[], targetKm: number): number {
  if (cumulative.length === 0) return -1;
  let lo = 0;
  let hi = cumulative.length - 1;
  if (targetKm <= cumulative[0]) return 0;
  if (targetKm >= cumulative[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < targetKm) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
