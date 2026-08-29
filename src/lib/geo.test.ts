import { describe, expect, it } from "vitest";
import {
  cumulativeDistanceKm,
  haversineDistanceKm,
  nearestIndexForDistance,
  nearestPointOnRoute,
} from "./geo";

// A simple L-shaped route: east along the equator, then north.
const ROUTE: [number, number][] = [
  [0, 0],
  [0, 0.01],
  [0, 0.02],
  [0.01, 0.02],
  [0.02, 0.02],
];

describe("haversineDistanceKm", () => {
  it("is zero for the same point", () => {
    expect(haversineDistanceKm([32, 34], [32, 34])).toBe(0);
  });

  it("matches a known short distance (~1.11 km per 0.01° of latitude)", () => {
    expect(haversineDistanceKm([0, 0], [0.01, 0])).toBeCloseTo(1.111, 2);
  });
});

describe("cumulativeDistanceKm", () => {
  it("starts at 0 and is monotonically non-decreasing", () => {
    const cum = cumulativeDistanceKm(ROUTE);
    expect(cum).toHaveLength(ROUTE.length);
    expect(cum[0]).toBe(0);
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
  });
});

describe("nearestIndexForDistance", () => {
  it("clamps below and above the route", () => {
    const cum = cumulativeDistanceKm(ROUTE);
    expect(nearestIndexForDistance(cum, -5)).toBe(0);
    expect(nearestIndexForDistance(cum, 9999)).toBe(cum.length - 1);
  });
});

describe("nearestPointOnRoute", () => {
  it("projects a point beside the first segment onto that segment", () => {
    // Slightly north of the equator, half way along the first east-bound segment.
    const { index, point } = nearestPointOnRoute(ROUTE, [0.001, 0.005]);
    expect(index).toBe(0);
    expect(point[0]).toBeCloseTo(0, 4);
    expect(point[1]).toBeCloseTo(0.005, 4);
  });

  it("snaps to a vertex when the target is past the end of the route", () => {
    const { index, point } = nearestPointOnRoute(ROUTE, [0.05, 0.02]);
    expect(index).toBe(ROUTE.length - 2);
    expect(point[0]).toBeCloseTo(0.02, 4);
    expect(point[1]).toBeCloseTo(0.02, 4);
  });

  it("picks the correct segment on the second (north-bound) leg", () => {
    const { index, point } = nearestPointOnRoute(ROUTE, [0.015, 0.021]);
    expect(index).toBe(3);
    expect(point[0]).toBeCloseTo(0.015, 3);
    expect(point[1]).toBeCloseTo(0.02, 3);
  });

  it("is a no-op-ish for degenerate routes", () => {
    expect(nearestPointOnRoute([], [1, 2])).toEqual({ index: -1, point: [1, 2] });
    expect(nearestPointOnRoute([[5, 6]], [1, 2])).toEqual({ index: 0, point: [5, 6] });
  });
});
