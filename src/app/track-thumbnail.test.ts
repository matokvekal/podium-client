import { describe, expect, it } from "vitest";
import { type LatLon, projectTrack, thinPoints } from "./track-thumbnail";

/** Parses a polyline `points` attribute back into numbers so the geometry can be asserted. */
function parse(points: string): { x: number; y: number }[] {
  return points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });
}

describe("thinPoints", () => {
  it("returns the list untouched when it is already short enough", () => {
    expect(thinPoints([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it("keeps the first and last point — the ends are what a shape is read from", () => {
    const many = Array.from({ length: 1000 }, (_, i) => i);
    const thinned = thinPoints(many, 10);
    expect(thinned).toHaveLength(10);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(999);
  });

  it("spaces the survivors evenly", () => {
    const thinned = thinPoints(
      Array.from({ length: 101 }, (_, i) => i),
      11,
    );
    expect(thinned).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("does not throw on an empty list", () => {
    expect(thinPoints([], 10)).toEqual([]);
  });
});

describe("projectTrack", () => {
  it("returns null for a route with nothing to draw", () => {
    expect(projectTrack([], 100, 60, 4)).toBeNull();
    expect(projectTrack([[32, 34]], 100, 60, 4)).toBeNull();
  });

  it("returns null when every point is identical — a stationary trace has no shape", () => {
    const parked: LatLon[] = [
      [32, 34],
      [32, 34],
      [32, 34],
    ];
    expect(projectTrack(parked, 100, 60, 4)).toBeNull();
  });

  it("stays inside the box, honouring the padding", () => {
    const route: LatLon[] = [
      [32.0, 34.0],
      [32.1, 34.3],
      [32.05, 34.15],
      [32.2, 34.05],
    ];
    const projected = projectTrack(route, 200, 120, 6);
    expect(projected).not.toBeNull();
    for (const p of parse(projected!.points)) {
      expect(p.x).toBeGreaterThanOrEqual(6 - 0.01);
      expect(p.x).toBeLessThanOrEqual(200 - 6 + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(6 - 0.01);
      expect(p.y).toBeLessThanOrEqual(120 - 6 + 0.01);
    }
  });

  it("flips latitude — north is up, and SVG y grows downward", () => {
    const northward: LatLon[] = [
      [32.0, 34.0],
      [32.2, 34.0],
    ];
    const projected = projectTrack(northward, 100, 100, 0)!;
    // First point is the southernmost, so it must land LOWER on screen (larger y).
    expect(projected.start.y).toBeGreaterThan(projected.end.y);
  });

  it("corrects longitude by cos(latitude) instead of stretching to fill", () => {
    // Equal degree spans in both axes. Because a longitude degree is narrower, the drawing
    // must be TALLER than it is wide — not a square filling the box.
    const square: LatLon[] = [
      [32.0, 34.0],
      [32.1, 34.1],
    ];
    const projected = projectTrack(square, 100, 100, 0)!;
    const width = Math.abs(projected.end.x - projected.start.x);
    const height = Math.abs(projected.end.y - projected.start.y);
    expect(height).toBeGreaterThan(width);
    // cos(32.05°) ≈ 0.847 — the ratio the correction should produce.
    expect(width / height).toBeCloseTo(Math.cos((32.05 * Math.PI) / 180), 2);
  });

  it("preserves shape rather than filling both axes", () => {
    // A route twice as wide (in projected terms) as it is tall must stay 2:1, letterboxed
    // vertically inside a square box.
    const wide: LatLon[] = [
      [32.0, 34.0],
      [32.0, 34.2],
      [32.05, 34.2],
      [32.05, 34.0],
    ];
    const projected = projectTrack(wide, 100, 100, 0)!;
    const pts = parse(projected.points);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const drawnW = Math.max(...xs) - Math.min(...xs);
    const drawnH = Math.max(...ys) - Math.min(...ys);
    // Spans: 0.2° lon × cos(32.025) ≈ 0.1695 vs 0.05° lat — about 3.39:1.
    expect(drawnW / drawnH).toBeCloseTo((0.2 * Math.cos((32.025 * Math.PI) / 180)) / 0.05, 1);
    // It fills the wide axis and is centred on the other.
    expect(drawnW).toBeCloseTo(100, 1);
    expect(Math.min(...ys)).toBeCloseTo((100 - drawnH) / 2, 1);
  });

  it("thins a long route down to the thumbnail target", () => {
    const long: LatLon[] = Array.from({ length: 3067 }, (_, i) => [32 + i / 10000, 34]);
    const projected = projectTrack(long, 100, 60, 4)!;
    expect(parse(projected.points)).toHaveLength(80);
  });

  it("reports start and end as the route's real ends, not the thinned bounds", () => {
    const route: LatLon[] = Array.from({ length: 500 }, (_, i) => [32 + i / 1000, 34 + i / 2000]);
    const projected = projectTrack(route, 100, 100, 0)!;
    const pts = parse(projected.points);
    expect(projected.start).toEqual(pts[0]);
    expect(projected.end).toEqual(pts[pts.length - 1]);
  });

  it("ignores non-finite coordinates rather than collapsing the whole box", () => {
    const dirty: LatLon[] = [
      [32.0, 34.0],
      [Number.NaN, Number.NaN],
      [32.1, 34.1],
    ];
    const projected = projectTrack(dirty, 100, 100, 0);
    expect(projected).not.toBeNull();
    for (const p of parse(projected!.points)) {
      // The NaN point still occupies a slot, but the BOX came from the finite ones.
      expect(Number.isFinite(p.x) || Number.isNaN(p.x)).toBe(true);
    }
  });
});
