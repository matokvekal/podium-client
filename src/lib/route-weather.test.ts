import { describe, expect, it } from "vitest";
import { cumulativeDistanceKm } from "./geo";
import { planRouteWeather } from "./route-weather";

const START = Date.UTC(2026, 8, 26, 4, 0); // Saturday 07:00 Israel

/** A straight line due east along the equator, `km` long. */
function eastLine(km: number): [number, number][] {
  const degrees = km / (6371 * (Math.PI / 180));
  return [
    [0, 0],
    [0, degrees],
  ];
}

/** A square loop (back to its own start) whose perimeter is roughly `km` long. */
function squareLoop(km: number): [number, number][] {
  const side = km / 4 / (6371 * (Math.PI / 180));
  return [
    [0, 0],
    [0, side],
    [side, side],
    [side, 0],
    [0, 0],
  ];
}

describe("planRouteWeather — how many points, by distance", () => {
  it("plans nothing for a short route (≤ 60 km) — one point already covers it", () => {
    const route = eastLine(40);
    expect(planRouteWeather({ points: route, startMs: START, durationMin: 90 })).toBeNull();
  });

  it("3 points (start, mid, finish) for a medium route (60–120 km)", () => {
    const route = eastLine(100);
    const totalKm = cumulativeDistanceKm(route).at(-1) ?? 0;
    const plan = planRouteWeather({ points: route, startMs: START, durationMin: 240 });
    expect(plan?.points.map((p) => p.label)).toEqual([
      "Start",
      `Km ${Math.round(totalKm / 2)}`,
      "Finish",
    ]);
  });

  it("5 points (capped) for a long route (> 120 km)", () => {
    const route = eastLine(150);
    const totalKm = cumulativeDistanceKm(route).at(-1) ?? 0;
    const plan = planRouteWeather({ points: route, startMs: START, durationMin: 360 });
    expect(plan?.points.map((p) => p.label)).toEqual([
      "Start",
      `Km ${Math.round(totalKm * 0.25)}`,
      `Km ${Math.round(totalKm * 0.5)}`,
      `Km ${Math.round(totalKm * 0.75)}`,
      "Finish",
    ]);
  });

  it("never plans more than 5 points, however long the route", () => {
    const route = eastLine(400);
    const plan = planRouteWeather({ points: route, startMs: START, durationMin: 720 });
    expect(plan?.points.length).toBeLessThanOrEqual(5);
  });
});

describe("planRouteWeather — ETA is proportional distance only", () => {
  it("07:00 start, 6 h ride, 150 km: 0/25/50/75/100% land on the worked example", () => {
    const route = eastLine(150);
    const plan = planRouteWeather({ points: route, startMs: START, durationMin: 360 });
    const offsetsMin = plan?.points.map((p) => Math.round((p.etaMs - START) / 60_000));
    expect(offsetsMin).toEqual([0, 90, 180, 270, 360]);
  });
});

describe("planRouteWeather — loop de-dup", () => {
  it("drops the Finish sample when the route returns within ~3 km of its own start", () => {
    const loop = squareLoop(100);
    const totalKm = cumulativeDistanceKm(loop).at(-1) ?? 0;
    const plan = planRouteWeather({ points: loop, startMs: START, durationMin: 240 });
    // Fractions for a 60-120 km route are [0, 0.5, 1]; the loop drops the fraction-1 sample, so
    // the midpoint (fraction 0.5) keeps its own "Km N" label rather than becoming "Finish".
    expect(plan?.points.map((p) => p.label)).toEqual(["Start", `Km ${Math.round(totalKm / 2)}`]);
  });

  it("keeps Start and Finish separate on a genuine point-to-point route", () => {
    const route = eastLine(100);
    const plan = planRouteWeather({ points: route, startMs: START, durationMin: 240 });
    expect(plan?.points.some((p) => p.label === "Finish")).toBe(true);
  });
});

describe("planRouteWeather — signature", () => {
  it("changes when the start, duration or route changes; stable otherwise", () => {
    const route = eastLine(100);
    const sig = (input: Parameters<typeof planRouteWeather>[0]) =>
      planRouteWeather(input)?.signature;
    const base = sig({ points: route, startMs: START, durationMin: 240 });
    expect(sig({ points: route, startMs: START + 1, durationMin: 240 })).not.toBe(base);
    expect(sig({ points: route, startMs: START, durationMin: 241 })).not.toBe(base);
    expect(sig({ points: eastLine(110), startMs: START, durationMin: 240 })).not.toBe(base);
    expect(sig({ points: route, startMs: START, durationMin: 240 })).toBe(base);
  });
});

describe("planRouteWeather — rejects what it cannot place", () => {
  it("no route, one point, NaN coordinates, non-finite or zero duration", () => {
    const route = eastLine(100);
    expect(planRouteWeather({ points: null, startMs: START, durationMin: 240 })).toBeNull();
    expect(planRouteWeather({ points: [[0, 0]], startMs: START, durationMin: 240 })).toBeNull();
    expect(
      planRouteWeather({
        points: [
          [0, 0],
          [Number.NaN, 1],
        ],
        startMs: START,
        durationMin: 240,
      }),
    ).toBeNull();
    expect(planRouteWeather({ points: route, startMs: Number.NaN, durationMin: 240 })).toBeNull();
    expect(planRouteWeather({ points: route, startMs: START, durationMin: 0 })).toBeNull();
  });
});
