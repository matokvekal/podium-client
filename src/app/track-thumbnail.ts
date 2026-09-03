// The little picture of a route on a gallery card.
//
// WHY THIS EXISTS RATHER THAN RouteMap. RouteMap builds a real Leaflet map: a map instance,
// an OpenStreetMap tile layer, markers, and a fitBounds pass — per card. TrackCard already
// renders one of those inside every result, which is survivable when the screen shows one
// card at a time (TracksPage pages with prev/next arrows). The gallery shows a grid and keeps
// loading more as you scroll, so the same approach would mean dozens of live map instances
// and a tile request storm against a free tile server that asks you not to do that.
//
// A card does not need a map. It needs the SHAPE of the ride — is it a loop, an out-and-back,
// a long straight drag — which is one polyline and no basemap at all. That is a few hundred
// bytes of inline SVG, no network, and it scales to as many cards as the list can hold.
//
// Leaflet is still the right tool once a rider is looking at ONE track and wants to know where
// it actually is; that stays lazy-loaded and unchanged.

/** A [lat, lon] pair — the tuple shape GET /events/:id/route returns. */
export type LatLon = [number, number];

/**
 * Roughly `maxCount` evenly-spaced points, always keeping the first and last.
 *
 * Mirrors the server's simplifyByStride (elnino-server/src/lib/geo.ts) deliberately: a route
 * here carries ~3,000 points and a card draws it about 150px wide, so nine tenths of them
 * land on a pixel that is already painted. Thinning is what keeps a screenful of cards cheap
 * to render, not just cheap to hold.
 */
export function thinPoints<T>(points: readonly T[], maxCount: number): T[] {
  if (maxCount < 2) return points.length > 0 ? [points[0]] : [];
  if (points.length <= maxCount) return [...points];
  const stride = (points.length - 1) / (maxCount - 1);
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) result.push(points[Math.round(i * stride)]);
  return result;
}

export interface ProjectedTrack {
  /** Ready for <polyline points={…} />. */
  points: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** How many points a thumbnail keeps. Beyond this the extra vertices are sub-pixel. */
export const THUMBNAIL_POINT_TARGET = 80;

/**
 * Projects lat/lon into a fixed viewBox.
 *
 * Two things this gets right that a naive min/max stretch does not:
 *
 *   1. LONGITUDE IS NARROWER THAN LATITUDE, by cos(latitude). At Israel's ~32°N a degree of
 *      longitude is about 0.85 of a degree of latitude, and at 60°N it is half. Scaling each
 *      axis independently to fill the box would squash a north-south ride and stretch an
 *      east-west one, so two rides of the same shape would draw differently depending only on
 *      their heading. The correction is applied once, here, before any scaling.
 *
 *   2. ONE SCALE FOR BOTH AXES, then centre. The route is letterboxed inside the box rather
 *      than fitted to it, which is what keeps a loop looking like a loop.
 *
 * Returns null when there is nothing to draw — fewer than two points, or a route whose points
 * are all identical (a stationary GPS trace, which does happen). Callers render their
 * placeholder for that rather than a zero-length line or a division by zero.
 */
export function projectTrack(
  points: readonly LatLon[],
  width: number,
  height: number,
  pad: number,
): ProjectedTrack | null {
  if (points.length < 2) return null;

  const thinned = thinPoints(points, THUMBNAIL_POINT_TARGET);

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  for (const [lat, lon] of thinned) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null;

  // Longitude degrees are compressed by cos(latitude); see (1) above. Taken at the middle of
  // the route, which is accurate to well under a pixel for anything one ride can span.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);

  const spanLat = maxLat - minLat;
  const spanLon = (maxLon - minLon) * lonScale;
  if (spanLat <= 0 && spanLon <= 0) return null; // every point identical

  const innerW = Math.max(width - pad * 2, 1);
  const innerH = Math.max(height - pad * 2, 1);
  // One scale for both axes so the shape is preserved; the smaller ratio is the one that fits.
  const scale = Math.min(
    spanLon > 0 ? innerW / spanLon : Number.POSITIVE_INFINITY,
    spanLat > 0 ? innerH / spanLat : Number.POSITIVE_INFINITY,
  );

  // Centre whatever is left over, so a wide route sits mid-height and a tall one mid-width.
  const offsetX = pad + (innerW - spanLon * scale) / 2;
  const offsetY = pad + (innerH - spanLat * scale) / 2;

  const project = (lat: number, lon: number) => ({
    x: offsetX + (lon - minLon) * lonScale * scale,
    // SVG y grows downward and latitude grows north, so this flips.
    y: offsetY + (maxLat - lat) * scale,
  });

  // Rounded once, here, so the start/finish markers sit on exactly the coordinates the
  // polyline was drawn from. Rounding only the string would put the dots a fraction off the
  // line they are supposed to cap.
  const projected = thinned.map(([lat, lon]) => {
    const p = project(lat, lon);
    return { x: round(p.x), y: round(p.y) };
  });
  return {
    points: projected.map((p) => `${p.x},${p.y}`).join(" "),
    start: projected[0],
    end: projected[projected.length - 1],
  };
}

/** Two decimals is finer than a screen pixel and keeps the attribute short. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
