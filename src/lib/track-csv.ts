// Upload-your-own-track, CSV only — "also can upload file like google csv excel of garmin
// points with start end and brakpoint rest." Deliberately scoped down to CSV: Excel (.xlsx)
// needs a real parsing library (e.g. `xlsx`, not installed, a real dependency decision) and
// Garmin's native formats (FIT binary, or GPX/TCX XML) each need their own parser — none of
// that is built here. A CSV of points (optionally exported from any of those tools) is the one
// format parseable with plain string splitting, no new dependency. See
// plan/server-tasks.md Part C §3 for the fuller upload feature this is a first slice of.
//
// Expected columns, in any order, matched by name (case-insensitive) if a header row is
// present: lat/latitude, lon/lng/longitude, and an optional type/marker/stop column — any row
// where that column contains "rest", "break", or "stop" marks a rest point. No header row at
// all falls back to "column 0 = lat, column 1 = lon."

export interface ParsedTrack {
  points: [number, number][];
  /** Indices into `points` that are rider-marked rest/break stops — first and last point are
   * always implicitly start/finish, never listed here even if also flagged as a stop. */
  restStopIndices: number[];
  distanceKm: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Straight-line sum between consecutive points — a reasonable estimate for a CSV of GPS
 * points (which already follow the road), not a routing-engine distance. */
function haversineKm(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [lat1, lon1] = points[i - 1];
    const [lat2, lon2] = points[i];
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

/** Returns null for anything unusable (empty, no parseable coordinate rows, fewer than 2
 * points) rather than a guess — never fabricates a route from a bad file. */
export function parseTrackCsv(text: string): ParsedTrack | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latCol = header.findIndex((h) => h === "lat" || h.startsWith("lat"));
  const lonCol = header.findIndex((h) => h === "lon" || h === "lng" || h.startsWith("lon"));
  const typeCol = header.findIndex(
    (h) => h.includes("type") || h.includes("marker") || h.includes("stop"),
  );
  const hasHeader = latCol >= 0 && lonCol >= 0;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const effectiveLatCol = hasHeader ? latCol : 0;
  const effectiveLonCol = hasHeader ? lonCol : 1;

  const points: [number, number][] = [];
  const restStopIndices: number[] = [];

  for (const line of dataLines) {
    const cols = line.split(",").map((c) => c.trim());
    const lat = Number.parseFloat(cols[effectiveLatCol]);
    const lon = Number.parseFloat(cols[effectiveLonCol]);
    if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      continue;
    }
    if (hasHeader && typeCol >= 0 && /rest|break|stop/i.test(cols[typeCol] ?? "")) {
      restStopIndices.push(points.length);
    }
    points.push([lat, lon]);
  }

  if (points.length < 2) return null;

  return { points, restStopIndices, distanceKm: Math.round(haversineKm(points) * 10) / 10 };
}
