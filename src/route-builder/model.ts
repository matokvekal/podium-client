// The Route Builder's route, as data — no React, no Leaflet, no network.
//
// A route is a list of WAYPOINTS (the few points the rider placed and can drag) and, between
// each consecutive pair, one SEGMENT holding the detailed line (often hundreds of points from
// the router). The rider edits waypoints; segments are what get drawn, measured and exported.
// Invariant kept by every function here: segments.length === max(0, waypoints.length - 1) and
// segments[i] runs from waypoints[i] to waypoints[i + 1].
//
// Every function returns a NEW draft and never mutates its input, so the store can keep old
// drafts as undo history for free.
//
// Segment modes:
//   routed   — follows roads/trails; geometry comes from the server (status "pending" until it
//              does). The rider can always see which parts were routed.
//   manual   — a straight line the rider chose. Never presented as a road.
//   imported — a stretch of an imported GPX, kept exactly as it was until the rider changes it.

import { elevationGainFromSeries } from "../lib/elevation";
import type { EventRoute } from "../lib/event-route";
import { cumulativeDistanceKm, haversineDistanceKm, nearestPointOnRoute } from "../lib/geo";

export type LatLng = [number, number];
export type RoutingProfile = "road" | "mtb";
export type SegmentMode = "routed" | "manual" | "imported";
export type SegmentStatus = "ready" | "pending" | "error";

export interface RouteWaypoint {
  id: string;
  position: LatLng;
}

export interface RouteSegment {
  id: string;
  mode: SegmentMode;
  profile: RoutingProfile;
  status: SegmentStatus;
  /** What this segment's geometry was (or is being) computed for. A routing answer is applied
   *  only while the key still matches — an older answer can never overwrite a newer edit. */
  key: string;
  geometry: LatLng[];
  /** Parallel to geometry; null where there is no elevation (straight lines, files without). */
  elevations: (number | null)[];
  distanceM: number;
  error: string | null;
}

export interface RouteDraft {
  name: string;
  profile: RoutingProfile;
  /** Straight-line drawing is on: new segments are manual instead of routed. */
  manual: boolean;
  source: "new" | "gpx-import";
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function emptyDraft(profile: RoutingProfile = "road"): RouteDraft {
  return { name: "", profile, manual: false, source: "new", waypoints: [], segments: [] };
}

const fmt = (p: LatLng) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

export function segmentKey(
  mode: SegmentMode,
  profile: RoutingProfile,
  from: LatLng,
  to: LatLng,
): string {
  return `${mode}|${mode === "routed" ? profile : "-"}|${fmt(from)}|${fmt(to)}`;
}

export function lineLengthM(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineDistanceKm(points[i - 1], points[i]);
  return total * 1000;
}

/** A straight segment — drawn and measured immediately, no network. */
function manualSegment(
  from: LatLng,
  to: LatLng,
  profile: RoutingProfile,
  id = newId("s"),
): RouteSegment {
  const geometry: LatLng[] = [from, to];
  return {
    id,
    mode: "manual",
    profile,
    status: "ready",
    key: segmentKey("manual", profile, from, to),
    geometry,
    elevations: [null, null],
    distanceM: lineLengthM(geometry),
    error: null,
  };
}

/** A routed segment waiting for the router. Its placeholder geometry is the straight line, so
 *  the map can show where it is going; it is not counted in the distance until it is ready. */
function pendingSegment(
  from: LatLng,
  to: LatLng,
  profile: RoutingProfile,
  id = newId("s"),
): RouteSegment {
  return {
    id,
    mode: "routed",
    profile,
    status: "pending",
    key: segmentKey("routed", profile, from, to),
    geometry: [from, to],
    elevations: [null, null],
    distanceM: 0,
    error: null,
  };
}

function newSegment(draft: RouteDraft, from: LatLng, to: LatLng, mode?: SegmentMode): RouteSegment {
  const useManual = mode ? mode === "manual" : draft.manual;
  return useManual
    ? manualSegment(from, to, draft.profile)
    : pendingSegment(from, to, draft.profile);
}

/** A segment whose endpoint moved: a straight line stays straight, anything else re-routes
 *  (an imported stretch that no longer reaches its point cannot be kept as it was). */
function rebuildSegment(
  draft: RouteDraft,
  seg: RouteSegment,
  from: LatLng,
  to: LatLng,
): RouteSegment {
  if (seg.mode === "manual") return manualSegment(from, to, draft.profile, seg.id);
  if (seg.mode === "imported" && draft.manual)
    return manualSegment(from, to, draft.profile, seg.id);
  return pendingSegment(from, to, draft.profile, seg.id);
}

// ---- edits ---------------------------------------------------------------------------------

export function addWaypoint(draft: RouteDraft, position: LatLng): RouteDraft {
  const waypoint: RouteWaypoint = { id: newId("w"), position };
  const last = draft.waypoints[draft.waypoints.length - 1];
  return {
    ...draft,
    waypoints: [...draft.waypoints, waypoint],
    segments: last
      ? [...draft.segments, newSegment(draft, last.position, position)]
      : draft.segments,
  };
}

export function moveWaypoint(draft: RouteDraft, waypointId: string, position: LatLng): RouteDraft {
  const index = draft.waypoints.findIndex((w) => w.id === waypointId);
  if (index === -1) return draft;
  const waypoints = draft.waypoints.map((w, i) => (i === index ? { ...w, position } : w));
  const segments = draft.segments.map((seg, i) => {
    if (i !== index - 1 && i !== index) return seg;
    return rebuildSegment(draft, seg, waypoints[i].position, waypoints[i + 1].position);
  });
  return { ...draft, waypoints, segments };
}

export function removeWaypoint(draft: RouteDraft, waypointId: string): RouteDraft {
  const index = draft.waypoints.findIndex((w) => w.id === waypointId);
  if (index === -1) return draft;
  const waypoints = draft.waypoints.filter((_, i) => i !== index);
  const segments = [...draft.segments];

  if (index === 0) {
    segments.splice(0, 1);
  } else if (index === draft.waypoints.length - 1) {
    segments.splice(index - 1, 1);
  } else {
    const before = draft.segments[index - 1];
    const after = draft.segments[index];
    let joined: RouteSegment;
    if (before.mode === "imported" && after.mode === "imported") {
      // Two untouched stretches of the same file: rejoining them gives back the original line
      // exactly, with no routing at all.
      joined = joinSegments(before, after);
    } else {
      const mode = before.mode === "manual" && after.mode === "manual" ? "manual" : undefined;
      joined = newSegment(draft, waypoints[index - 1].position, waypoints[index].position, mode);
    }
    segments.splice(index - 1, 2, joined);
  }
  return { ...draft, waypoints, segments };
}

function joinSegments(a: RouteSegment, b: RouteSegment): RouteSegment {
  const geometry = [...a.geometry, ...b.geometry.slice(1)];
  const from = geometry[0];
  const to = geometry[geometry.length - 1];
  return {
    ...a,
    id: newId("s"),
    key: segmentKey(a.mode, a.profile, from, to),
    geometry,
    elevations: [...a.elevations, ...b.elevations.slice(1)],
    distanceM: lineLengthM(geometry),
  };
}

/** Splits a segment's line at `at` (an index into geometry and the point on the line there). */
function splitSegment(
  seg: RouteSegment,
  index: number,
  point: LatLng,
): [RouteSegment, RouteSegment] {
  const eleAt = seg.elevations[index] ?? null;
  const leftGeom = [...seg.geometry.slice(0, index + 1), point];
  const rightGeom = [point, ...seg.geometry.slice(index + 1)];
  const leftEle = [...seg.elevations.slice(0, index + 1), eleAt];
  const rightEle = [eleAt, ...seg.elevations.slice(index + 1)];
  const make = (geometry: LatLng[], elevations: (number | null)[], id: string): RouteSegment => ({
    ...seg,
    id,
    key: segmentKey(seg.mode, seg.profile, geometry[0], geometry[geometry.length - 1]),
    geometry,
    elevations,
    distanceM: seg.status === "ready" ? lineLengthM(geometry) : 0,
  });
  return [make(leftGeom, leftEle, newId("s")), make(rightGeom, rightEle, newId("s"))];
}

/** How far either side of a new point on an imported line the rider's edit reaches. */
export const IMPORTED_EDIT_REACH_M = 500;

/**
 * A new waypoint where the rider tapped the line. The line itself does not change — the new
 * point sits on it, so nothing is re-routed until the point is dragged.
 *
 * On an IMPORTED line it also drops an anchor point about IMPORTED_EDIT_REACH_M either side, so
 * dragging the new point re-routes only that short stretch and the rest of the file stays as
 * it was (without anchors, one drag would re-route half the ride).
 */
export function insertOnSegment(draft: RouteDraft, segmentId: string, tap: LatLng): RouteDraft {
  const segIndex = draft.segments.findIndex((s) => s.id === segmentId);
  if (segIndex === -1) return draft;
  const seg = draft.segments[segIndex];
  if (seg.status === "pending" || seg.geometry.length < 2) return draft;

  const { index, point } = nearestPointOnRoute(seg.geometry, tap);
  const pieces: RouteSegment[] = [];
  const newWaypoints: RouteWaypoint[] = [];
  const insertedId = newId("w");

  if (seg.mode === "imported") {
    const cumulative = cumulativeDistanceKm(seg.geometry).map((km) => km * 1000);
    const total = cumulative[cumulative.length - 1];
    const at = cumulative[index] + haversineDistanceKm(seg.geometry[index], point) * 1000;
    const cuts: { distance: number; isTap: boolean }[] = [];
    if (at - IMPORTED_EDIT_REACH_M > IMPORTED_EDIT_REACH_M / 5) {
      cuts.push({ distance: at - IMPORTED_EDIT_REACH_M, isTap: false });
    }
    cuts.push({ distance: at, isTap: true });
    if (total - (at + IMPORTED_EDIT_REACH_M) > IMPORTED_EDIT_REACH_M / 5) {
      cuts.push({ distance: at + IMPORTED_EDIT_REACH_M, isTap: false });
    }

    let rest = seg;
    let consumed = 0;
    for (const cut of cuts) {
      const restCumulative = cumulativeDistanceKm(rest.geometry).map((km) => km * 1000 + consumed);
      const cutPoint = cut.isTap
        ? point
        : pointAtDistance(rest.geometry, restCumulative, cut.distance);
      const cutIndex = cut.isTap
        ? nearestPointOnRoute(rest.geometry, point).index
        : segmentIndexAtDistance(restCumulative, cut.distance);
      const [left, right] = splitSegment(rest, cutIndex, cutPoint);
      pieces.push(left);
      newWaypoints.push({ id: cut.isTap ? insertedId : newId("w"), position: cutPoint });
      consumed = cut.distance;
      rest = right;
    }
    pieces.push(rest);
  } else {
    const [left, right] = splitSegment(seg, index, point);
    pieces.push(left, right);
    newWaypoints.push({ id: insertedId, position: point });
  }

  const waypoints = [...draft.waypoints];
  waypoints.splice(segIndex + 1, 0, ...newWaypoints);
  const segments = [...draft.segments];
  segments.splice(segIndex, 1, ...pieces);
  return { ...draft, waypoints, segments };
}

function segmentIndexAtDistance(cumulative: readonly number[], distance: number): number {
  for (let i = 0; i < cumulative.length - 1; i++) {
    if (cumulative[i + 1] >= distance) return i;
  }
  return Math.max(0, cumulative.length - 2);
}

function pointAtDistance(
  points: readonly LatLng[],
  cumulative: readonly number[],
  distance: number,
): LatLng {
  const i = segmentIndexAtDistance(cumulative, distance);
  const span = cumulative[i + 1] - cumulative[i];
  const t = span > 0 ? Math.min(1, Math.max(0, (distance - cumulative[i]) / span)) : 0;
  return [
    points[i][0] + t * (points[i + 1][0] - points[i][0]),
    points[i][1] + t * (points[i + 1][1] - points[i][1]),
  ];
}

/** Turns one segment into a straight line, or back into a routed one. */
export function setSegmentMode(
  draft: RouteDraft,
  segmentId: string,
  mode: "routed" | "manual",
): RouteDraft {
  const index = draft.segments.findIndex((s) => s.id === segmentId);
  if (index === -1) return draft;
  const from = draft.waypoints[index].position;
  const to = draft.waypoints[index + 1].position;
  const seg = draft.segments[index];
  const next =
    mode === "manual"
      ? manualSegment(from, to, draft.profile, seg.id)
      : pendingSegment(from, to, draft.profile, seg.id);
  return { ...draft, segments: draft.segments.map((s, i) => (i === index ? next : s)) };
}

/** Road / off-road. Every routed segment re-routes with the new profile; straight lines and
 *  untouched imported stretches stay exactly as they are. */
export function setProfile(draft: RouteDraft, profile: RoutingProfile): RouteDraft {
  if (draft.profile === profile) return draft;
  const next = { ...draft, profile };
  return {
    ...next,
    segments: draft.segments.map((seg, i) =>
      seg.mode === "routed"
        ? pendingSegment(
            draft.waypoints[i].position,
            draft.waypoints[i + 1].position,
            profile,
            seg.id,
          )
        : seg,
    ),
  };
}

/** Adds a last leg back to the start. The rider's own last point stays where they put it. */
export function closeLoop(draft: RouteDraft): RouteDraft {
  if (!canCloseLoop(draft)) return draft;
  return addWaypoint(draft, draft.waypoints[0].position);
}

export function canCloseLoop(draft: RouteDraft): boolean {
  const n = draft.waypoints.length;
  if (n < 2) return false;
  const first = draft.waypoints[0].position;
  const last = draft.waypoints[n - 1].position;
  return haversineDistanceKm(first, last) * 1000 > 30;
}

export function setManual(draft: RouteDraft, manual: boolean): RouteDraft {
  return draft.manual === manual ? draft : { ...draft, manual };
}

export function renameDraft(draft: RouteDraft, name: string): RouteDraft {
  return { ...draft, name };
}

/** An imported GPX: start and finish waypoints, and the file's own line between them, kept
 *  exactly as it was. */
export function importTrack(
  profile: RoutingProfile,
  points: readonly LatLng[],
  elevations: readonly (number | null)[] | null,
  name: string,
): RouteDraft {
  const geometry = [...points];
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  const segment: RouteSegment = {
    id: newId("s"),
    mode: "imported",
    profile,
    status: "ready",
    key: segmentKey("imported", profile, first, last),
    geometry,
    elevations:
      elevations && elevations.length === geometry.length
        ? [...elevations]
        : geometry.map(() => null),
    distanceM: lineLengthM(geometry),
    error: null,
  };
  return {
    ...emptyDraft(profile),
    name,
    source: "gpx-import",
    waypoints: [
      { id: newId("w"), position: first },
      { id: newId("w"), position: last },
    ],
    segments: [segment],
  };
}

// ---- routing results -----------------------------------------------------------------------

export interface RoutedGeometry {
  points: [number, number, number | null][];
}

/** Applies a router answer — only if that segment is still waiting for exactly this key. */
export function applyRouted(
  draft: RouteDraft,
  segmentId: string,
  key: string,
  routed: RoutedGeometry,
): RouteDraft {
  const index = draft.segments.findIndex((s) => s.id === segmentId);
  const seg = draft.segments[index];
  if (!seg || seg.key !== key || seg.status !== "pending") return draft;
  const geometry: LatLng[] = routed.points.map(([lat, lng]) => [lat, lng]);
  const next: RouteSegment = {
    ...seg,
    status: "ready",
    geometry,
    elevations: routed.points.map((p) => p[2] ?? null),
    distanceM: lineLengthM(geometry),
    error: null,
  };
  return { ...draft, segments: draft.segments.map((s, i) => (i === index ? next : s)) };
}

export function applyRoutingError(
  draft: RouteDraft,
  segmentId: string,
  key: string,
  message: string,
): RouteDraft {
  const index = draft.segments.findIndex((s) => s.id === segmentId);
  const seg = draft.segments[index];
  if (!seg || seg.key !== key || seg.status !== "pending") return draft;
  const next: RouteSegment = { ...seg, status: "error", error: message };
  return { ...draft, segments: draft.segments.map((s, i) => (i === index ? next : s)) };
}

/** A failed segment, asked again. */
export function retrySegment(draft: RouteDraft, segmentId: string): RouteDraft {
  return draft.segments.some((s) => s.id === segmentId && s.status === "error")
    ? {
        ...draft,
        segments: draft.segments.map((s) =>
          s.id === segmentId ? { ...s, status: "pending", error: null } : s,
        ),
      }
    : draft;
}

// ---- reading the route ---------------------------------------------------------------------

export interface DraftStats {
  distanceM: number;
  climbM: number | null;
  pending: number;
  failed: number;
}

/** Distance from the drawn geometry — never straight lines between waypoints. A segment still
 *  waiting for the router is not counted (and `pending` says so), nor is a failed one. */
export function draftStats(draft: RouteDraft): DraftStats {
  let distanceM = 0;
  let pending = 0;
  let failed = 0;
  for (const seg of draft.segments) {
    if (seg.status === "ready") distanceM += seg.distanceM;
    else if (seg.status === "pending") pending++;
    else failed++;
  }
  const { elevations } = joinedLine(draft);
  return { distanceM, climbM: elevationGainFromSeries(elevations), pending, failed };
}

/** The whole line, end to end. A point repeated at a seam (one segment's end is the next one's
 *  start) is written once. */
export function joinedLine(draft: RouteDraft): { points: LatLng[]; elevations: (number | null)[] } {
  const points: LatLng[] = [];
  const elevations: (number | null)[] = [];
  for (const seg of draft.segments) {
    seg.geometry.forEach((p, i) => {
      const prev = points[points.length - 1];
      if (i === 0 && prev && haversineDistanceKm(prev, p) < 0.001) {
        if (elevations[elevations.length - 1] == null)
          elevations[elevations.length - 1] = seg.elevations[0] ?? null;
        return;
      }
      points.push(p);
      elevations.push(seg.elevations[i] ?? null);
    });
  }
  if (points.length === 0 && draft.waypoints.length === 1) {
    points.push(draft.waypoints[0].position);
    elevations.push(null);
  }
  return { points, elevations };
}

/** The route is complete: at least two points, nothing waiting on or refused by the router. */
export function isDraftComplete(draft: RouteDraft): boolean {
  return draft.segments.length > 0 && draft.segments.every((s) => s.status === "ready");
}

/** The finished route in the shape the ride form and GPX export use. */
export function draftToEventRoute(draft: RouteDraft): EventRoute {
  const { points, elevations } = joinedLine(draft);
  const stats = draftStats(draft);
  const hasElevation = elevations.filter((e) => e != null).length >= 2;
  return {
    points,
    distanceKm: Math.round(stats.distanceM / 100) / 10,
    elevationM: stats.climbM,
    elevations: hasElevation ? elevations : null,
  };
}
