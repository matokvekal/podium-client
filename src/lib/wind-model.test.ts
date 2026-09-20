import { describe, expect, it } from "vitest";
import {
  GUST_MARGIN_KMH,
  planWindWindow,
  representativePoint,
  showGust,
  WIND_COLOR_STOPS,
  WIND_WINDOW_PADDING_MS,
  windCellColors,
  windStrength,
} from "./wind-model";

const HOUR = 3_600_000;
// Saturday 26 Sep 2026, 06:30 Israel time (UTC+3) = 03:30 UTC.
const START = Date.UTC(2026, 8, 26, 3, 30);

// ~11.1 km due east along the equator, then ~11.1 km due north: halfway is the corner.
const L_ROUTE: [number, number][] = [
  [0, 0],
  [0, 0.05],
  [0, 0.1],
  [0.05, 0.1],
  [0.1, 0.1],
];

describe("windStrength — absolute speed bands", () => {
  it("edges are exclusive on the upper side", () => {
    expect(windStrength(0)).toBe("light");
    expect(windStrength(11.9)).toBe("light");
    expect(windStrength(12)).toBe("moderate");
    expect(windStrength(19.9)).toBe("moderate");
    expect(windStrength(20)).toBe("strong");
    expect(windStrength(29.9)).toBe("strong");
    expect(windStrength(30)).toBe("veryStrong");
    expect(windStrength(90)).toBe("veryStrong");
  });
});

describe("showGust", () => {
  it("only when the gust is meaningfully above the sustained speed", () => {
    expect(showGust(15, 15 + GUST_MARGIN_KMH)).toBe(true);
    expect(showGust(15, 15 + GUST_MARGIN_KMH - 0.1)).toBe(false);
    expect(showGust(15, null)).toBe(false);
  });
});

describe("representativePoint — the route's midpoint by distance", () => {
  it("is the corner of an L, not the start and not the bounding-box centre", () => {
    const p = representativePoint(L_ROUTE);
    expect(p?.lat).toBeCloseTo(0, 3);
    expect(p?.lng).toBeCloseTo(0.1, 3);
    expect(p?.totalKm).toBeCloseTo(22.2, 0);
  });

  it("interpolates inside a segment", () => {
    const p = representativePoint([
      [0, 0],
      [0, 0.2],
    ]);
    expect(p?.lat).toBeCloseTo(0, 6);
    expect(p?.lng).toBeCloseTo(0.1, 6);
  });

  it("stays ON an out-and-back, where the bounding-box centre is also on it but a loop's is not", () => {
    // A square loop's bbox centre is in the middle of the square — nowhere near the track.
    const loop: [number, number][] = [
      [0, 0],
      [0, 0.1],
      [0.1, 0.1],
      [0.1, 0],
      [0, 0],
    ];
    const p = representativePoint(loop);
    const onTrack = loop.some(
      ([lat, lng]) => Math.abs(lat - (p?.lat ?? 9)) < 1e-6 || Math.abs(lng - (p?.lng ?? 9)) < 1e-6,
    );
    expect(onTrack).toBe(true);
    expect(p?.lat).toBeCloseTo(0.1, 3); // halfway round is the far corner (0.1, 0.1)
    expect(p?.lng).toBeCloseTo(0.1, 3);
  });

  it("rejects what it cannot place", () => {
    expect(representativePoint(null)).toBeNull();
    expect(representativePoint([[0, 0]])).toBeNull();
    expect(
      representativePoint([
        [0, 0],
        [Number.NaN, 1],
      ]),
    ).toBeNull();
    expect(
      representativePoint([
        [1, 1],
        [1, 1],
      ]),
    ).toBeNull();
  });
});

describe("planWindWindow — start − 1 h through end + 1 h, hourly, nothing more", () => {
  it("06:30–10:30 gives 05:30 … 11:30 (7 columns)", () => {
    const plan = planWindWindow({ points: L_ROUTE, startMs: START, durationMin: 240 });
    const local = plan?.timesMs.map((t) => (t - START) / HOUR);
    expect(local).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    expect(plan?.timesMs[0]).toBe(START - WIND_WINDOW_PADDING_MS);
    expect(plan?.timesMs[plan.timesMs.length - 1]).toBe(
      START + 240 * 60_000 + WIND_WINDOW_PADDING_MS,
    );
  });

  it("never runs past end + 1 h, even when the span is not a whole number of hours", () => {
    const plan = planWindWindow({ points: L_ROUTE, startMs: START, durationMin: 150 });
    const last = plan?.timesMs[plan.timesMs.length - 1] ?? 0;
    expect(last).toBeLessThanOrEqual(START + 150 * 60_000 + WIND_WINDOW_PADDING_MS);
    // 05:30, 06:30, 07:30, 08:30, 09:30 (the window closes 10:00 — no 10:30 column).
    expect(plan?.timesMs.map((t) => (t - START) / HOUR)).toEqual([-1, 0, 1, 2, 3]);
  });

  it("asks about ONE place and carries no rider position, ETA or heading", () => {
    const plan = planWindWindow({ points: L_ROUTE, startMs: START, durationMin: 240 });
    expect(Object.keys(plan ?? {}).sort()).toEqual(["lat", "lng", "signature", "timesMs"]);
  });

  it("rejects what it cannot place", () => {
    expect(planWindWindow({ points: null, startMs: START, durationMin: 60 })).toBeNull();
    expect(planWindWindow({ points: L_ROUTE, startMs: Number.NaN, durationMin: 60 })).toBeNull();
    expect(planWindWindow({ points: L_ROUTE, startMs: START, durationMin: 0 })).toBeNull();
  });

  it("signature changes when the start, duration or route changes", () => {
    const sig = (input: Parameters<typeof planWindWindow>[0]) => planWindWindow(input)?.signature;
    const base = sig({ points: L_ROUTE, startMs: START, durationMin: 240 });
    expect(sig({ points: L_ROUTE, startMs: START + 1, durationMin: 240 })).not.toBe(base);
    expect(sig({ points: L_ROUTE, startMs: START, durationMin: 241 })).not.toBe(base);
    expect(
      sig({
        points: [
          [10, 10],
          [10, 10.4],
        ],
        startMs: START,
        durationMin: 240,
      }),
    ).not.toBe(base);
    expect(sig({ points: L_ROUTE, startMs: START, durationMin: 240 })).toBe(base);
  });
});

describe("windCellColors — the continuous strength ramp", () => {
  const rgb = (speed: number) =>
    (windCellColors(speed).background.match(/\d+/g) ?? []).map(Number) as [number, number, number];

  it("gives every 2 km/h step a visibly different colour across the whole ramp", () => {
    for (let v = 0; v < 48; v += 2) {
      const a = rgb(v);
      const b = rgb(v + 2);
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(distance, `${v}→${v + 2} km/h`).toBeGreaterThan(6);
    }
  });

  it("hits each stop exactly, and clamps below zero and above the last stop", () => {
    for (const [kmh, hex] of WIND_COLOR_STOPS) {
      const n = Number.parseInt(hex.slice(1), 16);
      expect(rgb(kmh)).toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
    expect(windCellColors(-5).background).toBe(windCellColors(0).background);
    expect(windCellColors(120).background).toBe(windCellColors(50).background);
    expect(windCellColors(Number.NaN).background).toBe(windCellColors(0).background);
  });

  it("reads light → green-ish, moderate → yellow, strong → orange, very strong → red/purple", () => {
    const [r6, g6, b6] = rgb(6);
    expect(b6).toBeGreaterThan(r6); // cool end
    expect(g6).toBeGreaterThan(r6);
    const [r18, g18] = rgb(18);
    expect(r18).toBeGreaterThan(200);
    expect(g18).toBeGreaterThan(200); // yellow
    const [r26, g26, b26] = rgb(26);
    expect(r26).toBeGreaterThan(g26); // orange
    expect(g26).toBeGreaterThan(b26);
    const [r36, g36] = rgb(36);
    expect(r36).toBeGreaterThan(g36 + 80); // red
  });

  it("keeps the number readable: dark text on light fills, white on the dark red/purple end", () => {
    expect(windCellColors(6).color).toBe("#14243c");
    expect(windCellColors(18).color).toBe("#14243c");
    expect(windCellColors(50).color).toBe("#ffffff");
    expect(windCellColors(40).color).toBe("#ffffff");
  });
});
