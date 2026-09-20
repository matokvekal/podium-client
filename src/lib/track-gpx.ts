// Upload-your-own-track, GPX — Garmin's native export format (GPS Exchange Format, ".gpx"),
// the other half of the "csv or gsx [sic, GPX] from garmin" upload requirement alongside
// lib/track-csv.ts's CSV parsing. A GPX file has no per-track-point "is this a rest stop"
// field the way the CSV format does; Garmin devices instead drop a separate <wpt> waypoint at
// the spot a rider marked. So rest stops here are inferred by nearest-point distance: any
// waypoint whose name/cmt/desc/sym mentions "rest", "break", or "stop" gets snapped to the
// closest point on the track.

import { elevationGainFromSeries, elevationSeriesOrNull } from "./elevation";
import type { EventRoute } from "./event-route";
import type { ParsedTrack } from "./track-csv";

function nearestPointIndex(points: [number, number][], target: [number, number]): number {
  let bestIndex = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const [lat, lon] = points[i];
    const dLat = lat - target[0];
    const dLon = lon - target[1];
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

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

function readLatLon(el: Element): [number, number] | null {
  const lat = Number.parseFloat(el.getAttribute("lat") ?? "");
  const lon = Number.parseFloat(el.getAttribute("lon") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return [lat, lon];
}

function elementText(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent ?? "";
}

/** Returns null for anything unusable (not valid XML, no parseable track points, fewer than
 * 2 points) — never fabricates a route from a bad file, same contract as parseTrackCsv. */
export function parseTrackGpx(text: string): ParsedTrack | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  // Prefer actual recorded/route points (trkpt); fall back to route points (rtept) for
  // Garmin "course" exports, which use rte instead of trk.
  const trackEls = Array.from(doc.getElementsByTagName("trkpt"));
  const routeEls = Array.from(doc.getElementsByTagName("rtept"));
  const pointEls = trackEls.length > 0 ? trackEls : routeEls;

  const points: [number, number][] = [];
  // Elevation runs parallel to `points` — one entry per KEPT point, null where the <ele> tag
  // is missing or unparseable. All-null (a GPX with no elevation at all) yields a null gain.
  const elevations: (number | null)[] = [];
  for (const el of pointEls) {
    const ll = readLatLon(el);
    if (!ll) continue;
    points.push(ll);
    const eleText = el.getElementsByTagName("ele")[0]?.textContent ?? "";
    const ele = Number.parseFloat(eleText);
    elevations.push(Number.isFinite(ele) ? ele : null);
  }
  if (points.length < 2) return null;

  const restStopIndices = new Set<number>();
  for (const wpt of Array.from(doc.getElementsByTagName("wpt"))) {
    const label = [
      wpt.getAttribute("sym") ?? "",
      elementText(wpt, "name"),
      elementText(wpt, "cmt"),
      elementText(wpt, "desc"),
    ].join(" ");
    if (!/rest|break|stop/i.test(label)) continue;
    const ll = readLatLon(wpt);
    if (!ll) continue;
    restStopIndices.add(nearestPointIndex(points, ll));
  }

  return {
    points,
    restStopIndices: Array.from(restStopIndices).sort((a, b) => a - b),
    distanceKm: Math.round(haversineKm(points) * 10) / 10,
    elevationGainM: elevationGainFromSeries(elevations),
    elevations: elevationSeriesOrNull(elevations),
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The write side of this file — a ride's route, turned back into a GPX a rider can save to
 * their phone and load into whatever bike computer or nav app they use. Deliberately the
 * simplest valid GPX: one <trk>/<trkseg> of <trkpt>s, <ele> only where the route actually has
 * a per-point elevation reading (see EventRoute.elevations's doc comment — absent, not
 * invented, for a route saved before the server kept the series). No waypoints are written
 * back out: rest stops are this app's own read of the source file, not something every GPX
 * consumer expects to receive round-tripped.
 */
export function buildGpxFile(route: Pick<EventRoute, "points" | "elevations">, name: string): string {
  const trkpts = route.points
    .map(([lat, lon], i) => {
      const ele = route.elevations?.[i];
      const eleTag = ele != null ? `\n        <ele>${ele}</ele>` : "";
      return `      <trkpt lat="${lat}" lon="${lon}">${eleTag}\n      </trkpt>`;
    })
    .join("\n");

  const safeName = escapeXml(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ElNino" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Filesystem-safe stem for the downloaded file — the ride's own name, or a generic fallback
 * when it's blank, so a title made of nothing but punctuation never produces an empty file. */
export function gpxFilenameFor(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "route"}.gpx`;
}

/** Saves a GPX string to the rider's device — a plain Blob + temporary link click, the same
 * mechanism every browser (including on a phone) treats as a real file download. */
export function downloadGpxFile(filename: string, gpxContent: string): void {
  const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The file name from a Content-Disposition header. Prefers the RFC 5987 `filename*` form — that
 * is how the server sends a Hebrew name — and falls back to the plain `filename`. `null` when
 * there is neither, so the caller picks its own.
 */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain form
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/);
  const name = (plain?.[1] ?? plain?.[2] ?? "").trim();
  return name || null;
}

/**
 * Saves the ORIGINAL GPX of a stored track — the exact bytes that were imported, not a file
 * rebuilt from the display line. Resolves `true` when a file was saved, `false` when this track
 * has no stored original (every track that was not imported) or the request failed; the caller
 * then falls back to buildGpxFile, which is what the button always did. Never throws.
 */
export async function downloadOriginalGpx(routeId: number, fallbackName: string): Promise<boolean> {
  try {
    const { apiRequestBlob } = await import("./api-client");
    const file = await apiRequestBlob(`/routes/${routeId}/gpx`);
    if (!file) return false;
    const name = filenameFromContentDisposition(file.contentDisposition) ?? fallbackName;
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
