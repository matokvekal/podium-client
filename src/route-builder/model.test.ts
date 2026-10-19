/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { simplifyIndicesToCount } from "../lib/geo";
import { buildGpxFile, parseTrackGpx } from "../lib/track-gpx";
import {
  addWaypoint,
  applyRouted,
  applyRoutingError,
  canCloseLoop,
  closeLoop,
  draftStats,
  draftToEventRoute,
  emptyDraft,
  importTrack,
  insertOnSegment,
  isDraftComplete,
  joinedLine,
  type LatLng,
  moveWaypoint,
  type RouteDraft,
  removeWaypoint,
  retrySegment,
  setManual,
  setProfile,
  setSegmentMode,
} from "./model";

const PEDAYA: LatLng = [31.85, 34.95];
const NACHSHON: LatLng = [31.83, 34.97];
const BEIT_SHEMESH: LatLng = [31.75, 34.99];

/** What the router would answer: the straight line with one bend through `via`. */
function routeVia(draft: RouteDraft, index: number, via: LatLng, ele = 100): RouteDraft {
  const seg = draft.segments[index];
  const [from, to] = [draft.waypoints[index].position, draft.waypoints[index + 1].position];
  return applyRouted(draft, seg.id, seg.key, {
    points: [
      [from[0], from[1], ele],
      [via[0], via[1], ele + 50],
      [to[0], to[1], ele + 10],
    ],
  });
}

function threePointRoad(): RouteDraft {
  let d = emptyDraft("road");
  d = addWaypoint(d, PEDAYA);
  d = addWaypoint(d, NACHSHON);
  d = addWaypoint(d, BEIT_SHEMESH);
  d = routeVia(d, 0, [31.84, 34.955]);
  d = routeVia(d, 1, [31.8, 34.975]);
  return d;
}

describe("building a route", () => {
  it("adds waypoints with a pending routed segment between each pair", () => {
    let d = addWaypoint(emptyDraft("road"), PEDAYA);
    expect(d.segments).toHaveLength(0);
    d = addWaypoint(d, NACHSHON);
    expect(d.waypoints).toHaveLength(2);
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0]).toMatchObject({ mode: "routed", profile: "road", status: "pending" });
    // Not counted until the router answers — never a straight line passed off as the route.
    expect(draftStats(d)).toMatchObject({ distanceM: 0, pending: 1 });
  });

  it("builds an off-road route with the mtb profile", () => {
    let d = addWaypoint(emptyDraft("mtb"), PEDAYA);
    d = addWaypoint(d, NACHSHON);
    expect(d.segments[0].profile).toBe("mtb");
    expect(d.segments[0].key).toContain("|mtb|");
  });

  it("uses distinct stable ids, not positions in a list", () => {
    const d = threePointRoad();
    const ids = new Set([...d.waypoints.map((w) => w.id), ...d.segments.map((s) => s.id)]);
    expect(ids.size).toBe(5);
  });

  it("measures distance from the routed geometry, not the straight line", () => {
    const d = threePointRoad();
    const straightM = draftStats(
      setSegmentMode(setSegmentMode(d, d.segments[0].id, "manual"), d.segments[1].id, "manual"),
    ).distanceM;
    // The routed line bends, so it is longer than the straight one between the same points.
    expect(draftStats(d).distanceM).toBeGreaterThan(straightM);
    expect(isDraftComplete(d)).toBe(true);
    expect(draftStats(d).climbM).toBeGreaterThan(0);
  });

  it("draws straight lines immediately in straight-line mode", () => {
    let d = setManual(emptyDraft(), true);
    d = addWaypoint(addWaypoint(d, PEDAYA), NACHSHON);
    expect(d.segments[0]).toMatchObject({ mode: "manual", status: "ready" });
    expect(draftStats(d).distanceM).toBeGreaterThan(2500);
    expect(draftStats(d).distanceM).toBeLessThan(3200);
  });
});

describe("editing", () => {
  it("moving a waypoint re-routes only its two neighbouring segments", () => {
    let d = threePointRoad();
    d = addWaypoint(d, PEDAYA);
    d = routeVia(d, 2, [31.8, 34.97]);
    const before = d.segments.map((s) => s.key);
    d = moveWaypoint(d, d.waypoints[1].id, [31.829, 34.971]);
    expect(d.segments[0].status).toBe("pending");
    expect(d.segments[1].status).toBe("pending");
    expect(d.segments[2].status).toBe("ready");
    expect(d.segments[2].key).toBe(before[2]);
    // Same segment ids — a drag changes a segment, it does not replace it.
    expect(d.segments[0].key).not.toBe(before[0]);
  });

  it("moving an end point re-routes one segment", () => {
    let d = threePointRoad();
    d = moveWaypoint(d, d.waypoints[2].id, [31.76, 34.99]);
    expect(d.segments.map((s) => s.status)).toEqual(["ready", "pending"]);
  });

  it("removing a middle waypoint joins its neighbours with one new segment", () => {
    let d = threePointRoad();
    d = removeWaypoint(d, d.waypoints[1].id);
    expect(d.waypoints.map((w) => w.position)).toEqual([PEDAYA, BEIT_SHEMESH]);
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].status).toBe("pending");
  });

  it("removing the start or finish drops just that leg", () => {
    let d = threePointRoad();
    d = removeWaypoint(d, d.waypoints[0].id);
    expect(d.waypoints[0].position).toEqual(NACHSHON);
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].status).toBe("ready");
    d = removeWaypoint(d, d.waypoints[1].id);
    expect(d.segments).toHaveLength(0);
  });

  it("tapping the line inserts a waypoint ON the line without re-routing", () => {
    let d = threePointRoad();
    const segId = d.segments[0].id;
    const length = draftStats(d).distanceM;
    d = insertOnSegment(d, segId, [31.8405, 34.9548]);
    expect(d.waypoints).toHaveLength(4);
    expect(d.segments).toHaveLength(3);
    expect(d.segments.every((s) => s.status === "ready")).toBe(true);
    expect(draftStats(d).distanceM).toBeCloseTo(length, 0);
    // The new point sits on the line, between Pedaya and Nachshon.
    const inserted = d.waypoints[1].position;
    expect(inserted[0]).toBeLessThan(PEDAYA[0]);
    expect(inserted[0]).toBeGreaterThan(NACHSHON[0]);
    // …and dragging it re-routes only its two sides.
    d = moveWaypoint(d, d.waypoints[1].id, [31.84, 34.96]);
    expect(d.segments.map((s) => s.status)).toEqual(["pending", "pending", "ready"]);
  });

  it("a segment can be switched to a straight line and back", () => {
    let d = threePointRoad();
    const segId = d.segments[1].id;
    d = setSegmentMode(d, segId, "manual");
    expect(d.segments[1]).toMatchObject({ id: segId, mode: "manual", status: "ready" });
    expect(d.segments[1].geometry).toEqual([NACHSHON, BEIT_SHEMESH]);
    d = setSegmentMode(d, segId, "routed");
    expect(d.segments[1]).toMatchObject({ mode: "routed", status: "pending" });
  });

  it("changing profile re-routes routed segments and leaves straight lines alone", () => {
    let d = threePointRoad();
    d = setSegmentMode(d, d.segments[1].id, "manual");
    d = setProfile(d, "mtb");
    expect(d.segments[0]).toMatchObject({ profile: "mtb", status: "pending" });
    expect(d.segments[1]).toMatchObject({ mode: "manual", status: "ready" });
  });

  it("closing the loop adds a leg back to the start without moving the last point", () => {
    let d = threePointRoad();
    expect(canCloseLoop(d)).toBe(true);
    d = closeLoop(d);
    expect(d.waypoints).toHaveLength(4);
    expect(d.waypoints[2].position).toEqual(BEIT_SHEMESH);
    expect(d.waypoints[3].position).toEqual(PEDAYA);
    expect(canCloseLoop(d)).toBe(false);
    expect(closeLoop(d)).toBe(d);
  });
});

describe("routing answers", () => {
  it("ignores an answer for a key the segment no longer has (stale response)", () => {
    let d = addWaypoint(addWaypoint(emptyDraft(), PEDAYA), NACHSHON);
    const old = d.segments[0];
    d = moveWaypoint(d, d.waypoints[1].id, BEIT_SHEMESH);
    const after = applyRouted(d, old.id, old.key, {
      points: [
        [1, 1, null],
        [2, 2, null],
      ],
    });
    expect(after).toBe(d);
    expect(after.segments[0].status).toBe("pending");
  });

  it("a failure is shown, never replaced by a silent straight line, and can be retried or drawn straight", () => {
    let d = addWaypoint(addWaypoint(emptyDraft(), PEDAYA), NACHSHON);
    const seg = d.segments[0];
    d = applyRoutingError(d, seg.id, seg.key, "No bike route to this point — drag it onto a road.");
    expect(d.segments[0]).toMatchObject({
      status: "error",
      mode: "routed",
      error: "No bike route to this point — drag it onto a road.",
    });
    expect(isDraftComplete(d)).toBe(false);
    expect(draftStats(d).failed).toBe(1);
    expect(retrySegment(d, seg.id).segments[0].status).toBe("pending");
    const straight = setSegmentMode(d, seg.id, "manual");
    expect(straight.segments[0]).toMatchObject({ mode: "manual", status: "ready" });
    expect(isDraftComplete(straight)).toBe(true);
  });
});

describe("imported GPX", () => {
  // A straight 3 km north-south line, one point every ~111 m.
  const line: LatLng[] = Array.from({ length: 28 }, (_, i) => [31.8 + i * 0.001, 34.95]);
  const eles = line.map((_, i) => 100 + i);

  it("keeps the file's line as one untouched segment between start and finish", () => {
    const d = importTrack("mtb", line, eles, "Ben Shemen");
    expect(d.waypoints).toHaveLength(2);
    expect(d.segments[0]).toMatchObject({ mode: "imported", status: "ready" });
    expect(d.segments[0].geometry).toHaveLength(28);
    expect(draftToEventRoute(d).points).toEqual(line);
  });

  it("switching Road / Off-road never touches the imported line", () => {
    const d = importTrack("road", line, eles, "x");
    const switched = setProfile(d, "mtb");
    expect(switched.profile).toBe("mtb");
    expect(switched.segments[0]).toBe(d.segments[0]);
  });

  it("inserting on it adds anchors so a drag re-routes only the nearby stretch", () => {
    let d = importTrack("mtb", line, eles, "x");
    d = insertOnSegment(d, d.segments[0].id, [31.8135, 34.9501]);
    // start, anchor, tapped point, anchor, finish
    expect(d.waypoints).toHaveLength(5);
    expect(d.segments.every((s) => s.mode === "imported" && s.status === "ready")).toBe(true);
    expect(joinedLine(d).points.length).toBeGreaterThanOrEqual(28);
    const tapped = d.waypoints[2];
    d = moveWaypoint(d, tapped.id, [31.8135, 34.952]);
    expect(d.segments.map((s) => s.status)).toEqual(["ready", "pending", "pending", "ready"]);
    expect(d.segments[0].mode).toBe("imported");
    expect(d.segments[3].mode).toBe("imported");
  });

  it("removing an inserted point between two untouched stretches restores the original line", () => {
    let d = importTrack("mtb", line, eles, "x");
    d = insertOnSegment(d, d.segments[0].id, [31.8135, 34.9501]);
    while (d.waypoints.length > 2) d = removeWaypoint(d, d.waypoints[1].id);
    expect(d.segments[0].mode).toBe("imported");
    expect(d.segments[0].status).toBe("ready");
  });
});

describe("export", () => {
  it("writes the whole routed line to GPX and reads back the same track", () => {
    const d = threePointRoad();
    const route = draftToEventRoute(d);
    // Seam points are written once: 3 + 3 points with one shared = 5.
    expect(route.points).toHaveLength(5);
    const parsed = parseTrackGpx(buildGpxFile(route, "Pedaya <loop> & back"));
    expect(parsed?.points).toEqual(route.points);
    expect(parsed?.elevations).toEqual(route.elevations);
  });

  it("simplifies only when asked and keeps the corners", () => {
    const zigzag: LatLng[] = [];
    for (let i = 0; i < 100; i++) zigzag.push([31.8 + i * 0.0001, 34.95 + (i === 50 ? 0.01 : 0)]);
    expect(simplifyIndicesToCount(zigzag, 200)).toHaveLength(100);
    const kept = simplifyIndicesToCount(zigzag, 5);
    expect(kept).toContain(0);
    expect(kept).toContain(50);
    expect(kept).toContain(99);
  });
});
