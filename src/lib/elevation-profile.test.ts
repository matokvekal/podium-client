import { describe, expect, it } from "vitest";
import {
  buildElevationProfile,
  distanceTicks,
  elevationAxis,
  niceTicks,
} from "./elevation-profile";

/** A straight line due north, so the expected distance is checkable by hand: along a meridian
 *  the haversine distance is exactly R * dLat, i.e. 0.001 deg = 0.111195 km with R = 6371. */
const KM_PER_MILLIDEGREE = 6371 * ((0.001 * Math.PI) / 180);

function northwardRoute(count: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) points.push([32 + i * 0.001, 34.8]);
  return points;
}

/** A rolling series with one sharp summit, so peak preservation is testable. */
function summitSeries(count: number, peakIndex: number, peakM: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(i === peakIndex ? peakM : 100 + Math.sin(i / 3) * 5);
  }
  return values;
}

describe("buildElevationProfile", () => {
  it("builds a profile from a route that carries elevation", () => {
    const points = northwardRoute(10);
    const elevations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    const profile = buildElevationProfile(points, elevations);

    expect(profile).not.toBeNull();
    expect(profile?.samples).toHaveLength(10);
    expect(profile?.minM).toBe(10);
    expect(profile?.maxM).toBe(100);
    expect(profile?.samples[0]).toEqual({ distanceKm: 0, elevationM: 10 });
  });

  it("measures cumulative distance along the route, never the point index", () => {
    const points = northwardRoute(20);
    const elevations = new Array(20).fill(50);

    const profile = buildElevationProfile(points, elevations);
    const distances = profile?.samples.map((s) => s.distanceKm) ?? [];

    expect(distances[0]).toBe(0);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
    // Evenly spaced points on a meridian mean evenly spaced distances.
    expect(distances[1]).toBeCloseTo(KM_PER_MILLIDEGREE, 5);
  });

  it("ends at the real total distance of the route", () => {
    const points = northwardRoute(100); // 99 segments
    const elevations = new Array(100).fill(200);

    const profile = buildElevationProfile(points, elevations);

    expect(profile?.totalKm).toBeCloseTo(99 * KM_PER_MILLIDEGREE, 4);
    expect(profile?.totalKm).toBeCloseTo(11.008, 2);
  });

  it("keeps distances honest across a gap in the elevation data", () => {
    // Only the two ends carry elevation. The line must still span the full width of the route
    // rather than pulling the last point backwards.
    const points = northwardRoute(11);
    const elevations = [100, null, null, null, null, null, null, null, null, null, 300];

    const profile = buildElevationProfile(points, elevations);

    expect(profile?.samples).toHaveLength(2);
    expect(profile?.samples[1].distanceKm).toBeCloseTo(10 * KM_PER_MILLIDEGREE, 5);
    expect(profile?.totalKm).toBeCloseTo(10 * KM_PER_MILLIDEGREE, 5);
  });

  describe("returns null rather than drawing something broken", () => {
    it("when there is no elevation array at all", () => {
      expect(buildElevationProfile(northwardRoute(5), null)).toBeNull();
      expect(buildElevationProfile(northwardRoute(5), undefined)).toBeNull();
    });

    it("when every elevation is missing", () => {
      expect(buildElevationProfile(northwardRoute(5), [null, null, null, null, null])).toBeNull();
    });

    it("when the elevations do not line up with the points", () => {
      expect(buildElevationProfile(northwardRoute(5), [1, 2, 3])).toBeNull();
    });

    it("when elevation values are malformed", () => {
      const points = northwardRoute(4);
      const nan = Number.NaN;

      expect(buildElevationProfile(points, [nan, nan, nan, nan])).toBeNull();
      expect(
        buildElevationProfile(points, [
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          nan,
          nan,
        ]),
      ).toBeNull();
      // Past Everest is a corrupt tag, not a mountain.
      expect(buildElevationProfile(points, [99999, 99999, 99999, 99999])).toBeNull();
    });

    it("when only one point has usable elevation", () => {
      expect(buildElevationProfile(northwardRoute(5), [100, null, null, null, null])).toBeNull();
    });

    it("when the route is empty or a single point", () => {
      expect(buildElevationProfile([], [])).toBeNull();
      expect(buildElevationProfile([[32, 34.8]], [100])).toBeNull();
      expect(buildElevationProfile(null, null)).toBeNull();
    });

    it("when a coordinate is malformed", () => {
      const points: [number, number][] = [
        [32, 34.8],
        [Number.NaN, 34.8],
        [32.002, 34.8],
      ];
      expect(buildElevationProfile(points, [10, 20, 30])).toBeNull();
    });

    it("when the route has no length", () => {
      const points: [number, number][] = [
        [32, 34.8],
        [32, 34.8],
      ];
      expect(buildElevationProfile(points, [10, 20])).toBeNull();
    });
  });

  describe("downsampling", () => {
    it("reduces a long series without dropping the summit", () => {
      const count = 4000;
      const points = northwardRoute(count);
      const elevations = summitSeries(count, 1777, 1850);

      const profile = buildElevationProfile(points, elevations, 240);

      expect(profile?.samples.length).toBeLessThanOrEqual(260);
      expect(profile?.samples.length).toBeLessThan(count);
      expect(profile?.maxM).toBe(1850);
      expect(profile?.samples.some((s) => s.elevationM === 1850)).toBe(true);
    });

    it("keeps the deepest valley too", () => {
      const count = 3000;
      const elevations = summitSeries(count, 900, 1200);
      elevations[2200] = -390; // Dead Sea

      const profile = buildElevationProfile(northwardRoute(count), elevations, 240);

      expect(profile?.minM).toBe(-390);
      expect(profile?.maxM).toBe(1200);
    });

    it("keeps the first and last points of the route", () => {
      const count = 2500;
      const elevations = summitSeries(count, 1200, 900);
      elevations[0] = 7;
      elevations[count - 1] = 11;

      const profile = buildElevationProfile(northwardRoute(count), elevations, 240);
      const samples = profile?.samples ?? [];

      expect(samples[0].elevationM).toBe(7);
      expect(samples[0].distanceKm).toBe(0);
      expect(samples[samples.length - 1].elevationM).toBe(11);
      expect(samples[samples.length - 1].distanceKm).toBeCloseTo(profile?.totalKm ?? 0, 6);
    });

    it("leaves distance non-decreasing after reduction", () => {
      const count = 5000;
      const profile = buildElevationProfile(
        northwardRoute(count),
        summitSeries(count, 2500, 1500),
        240,
      );
      const samples = profile?.samples ?? [];

      expect(samples.length).toBeGreaterThan(2);
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].distanceKm).toBeGreaterThanOrEqual(samples[i - 1].distanceKm);
      }
    });

    it("leaves a short series untouched", () => {
      const elevations = new Array(50).fill(0).map((_, i) => 100 + i);
      expect(buildElevationProfile(northwardRoute(50), elevations)?.samples).toHaveLength(50);
    });
  });
});

describe("niceTicks", () => {
  it("picks round values, not the raw data range", () => {
    expect(niceTicks(0, 100, 3)).toEqual([0, 50, 100]);
    expect(niceTicks(0, 300, 4)).toEqual([0, 100, 200, 300]);
  });

  it("scales from a coastal ride to a mountain stage without hard-coded steps", () => {
    const coastal = niceTicks(0, 40, 3);
    const alpine = niceTicks(0, 2400, 4);

    expect(coastal[coastal.length - 1]).toBeLessThanOrEqual(40);
    expect(alpine[alpine.length - 1]).toBeLessThanOrEqual(2400);
    expect(alpine[1] - alpine[0]).toBeGreaterThan(coastal[1] - coastal[0]);
  });

  it("handles a below-sea-level range", () => {
    const ticks = niceTicks(-400, -100, 3);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeGreaterThanOrEqual(-400);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(-100);
  });

  it("is safe on degenerate input", () => {
    expect(niceTicks(Number.NaN, 10, 3)).toEqual([]);
    expect(niceTicks(10, 5, 3)).toEqual([]);
    expect(niceTicks(50, 50, 3)).toEqual([50]);
  });
});

describe("elevationAxis", () => {
  it("tracks the route's own range instead of anchoring at sea level", () => {
    const profile = buildElevationProfile(northwardRoute(5), [1400, 1450, 1500, 1550, 1600]);
    const axis = elevationAxis(profile as NonNullable<typeof profile>);

    // A 1400-1600 m route drawn from 0 would be a flat sliver with no visible climbs.
    expect(axis.minM).toBeGreaterThan(1000);
    expect(axis.minM).toBeLessThanOrEqual(1400);
    expect(axis.maxM).toBeGreaterThanOrEqual(1600);
  });

  it("does not exaggerate a flat route", () => {
    const profile = buildElevationProfile(northwardRoute(5), [40, 41, 42, 41, 43]);
    const axis = elevationAxis(profile as NonNullable<typeof profile>);

    // 3 m of variation must not be stretched to fill the chart.
    expect(axis.maxM - axis.minM).toBeGreaterThanOrEqual(100);
  });

  it("covers the whole data range", () => {
    const profile = buildElevationProfile(northwardRoute(6), [120, 380, 90, 640, 210, 300]);
    const axis = elevationAxis(profile as NonNullable<typeof profile>);

    expect(axis.minM).toBeLessThanOrEqual(90);
    expect(axis.maxM).toBeGreaterThanOrEqual(640);
    expect(axis.ticks.length).toBeGreaterThan(1);
  });

  it("works below sea level", () => {
    const profile = buildElevationProfile(northwardRoute(4), [-400, -350, -420, -300]);
    const axis = elevationAxis(profile as NonNullable<typeof profile>);

    expect(axis.minM).toBeLessThanOrEqual(-420);
    expect(axis.maxM).toBeGreaterThanOrEqual(-300);
  });
});

describe("distanceTicks", () => {
  it("marks round kilometres across the route", () => {
    const ticks = distanceTicks(42.7, 4);

    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(42.7);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it("is safe on a zero-length or invalid route", () => {
    expect(distanceTicks(0)).toEqual([]);
    expect(distanceTicks(Number.NaN)).toEqual([]);
  });
});
