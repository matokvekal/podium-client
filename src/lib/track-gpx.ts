// Upload-your-own-track, GPX — Garmin's native export format (GPS Exchange Format, ".gpx"),
// the other half of the "csv or gsx [sic, GPX] from garmin" upload requirement alongside
// lib/track-csv.ts's CSV parsing. A GPX file has no per-track-point "is this a rest stop"
// field the way the CSV format does; Garmin devices instead drop a separate <wpt> waypoint at
// the spot a rider marked. So rest stops here are inferred by nearest-point distance: any
// waypoint whose name/cmt/desc/sym mentions "rest", "break", or "stop" gets snapped to the
// closest point on the track.

import { elevationGainFromSeries } from "./elevation";
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
  };
}
