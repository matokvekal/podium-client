import { describe, expect, it } from "vitest";
import {
  CURRENT_PERIOD_TTL_MS,
  currentPeriodKey,
  formatStatValue,
  fromParamFor,
  mergePeriods,
  needsRefresh,
  type PeriodEntry,
  percentChange,
  periodLabel,
} from "./statistics-periods";

const ZERO = { rides: 0, distanceKm: 0, climbM: 0, hours: 0, calories: 0 };
const GEMS = {
  hours: "stone",
  rides: "stone",
  calories: "stone",
  distance: "stone",
  climb: "stone",
} as const;

function entry(period: string, final: boolean, rides = 1): PeriodEntry {
  return { period, ...ZERO, rides, gems: { ...GEMS }, previous: ZERO, final };
}

const NOW = new Date("2026-09-19T12:00:00Z");

describe("currentPeriodKey / periodLabel", () => {
  it("keys and labels in UTC", () => {
    expect(currentPeriodKey("month", NOW)).toBe("2026-09");
    expect(currentPeriodKey("year", NOW)).toBe("2026");
    // 23:30 UTC on 31 Aug is still August, whatever the phone's timezone says.
    expect(currentPeriodKey("month", new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    expect(periodLabel("month", "2026-09")).toBe("September 2026");
    expect(periodLabel("year", "2026")).toBe("2026");
  });
});

describe("needsRefresh — 24h for the current period, no expiry for closed ones", () => {
  const held = [entry("2026-09", false), entry("2026-08", true)];

  it("asks when the device holds nothing", () => {
    expect(needsRefresh(null, "month", NOW)).toBe(true);
    expect(needsRefresh({ periods: [], lastSyncedAt: NOW.getTime() }, "month", NOW)).toBe(true);
  });

  it("does not ask while the current period is under 24h old", () => {
    const cached = {
      periods: held,
      lastSyncedAt: NOW.getTime() - (CURRENT_PERIOD_TTL_MS - 60_000),
    };
    expect(needsRefresh(cached, "month", NOW)).toBe(false);
  });

  it("asks once the current period is 24h old", () => {
    const cached = { periods: held, lastSyncedAt: NOW.getTime() - CURRENT_PERIOD_TTL_MS };
    expect(needsRefresh(cached, "month", NOW)).toBe(true);
  });

  it("asks when a new month has started, however fresh the cache is", () => {
    const cached = { periods: [entry("2026-08", false)], lastSyncedAt: NOW.getTime() - 1000 };
    expect(needsRefresh(cached, "month", NOW)).toBe(true);
  });
});

describe("fromParamFor — only ask for what the device is unsure of", () => {
  it("asks for everything when nothing is held", () => {
    expect(fromParamFor(null)).toBeUndefined();
    expect(fromParamFor([])).toBeUndefined();
  });

  it("starts from the oldest period that is not final", () => {
    const held = [entry("2026-09", false), entry("2026-08", false), entry("2026-07", true)];
    expect(fromParamFor(held)).toBe("2026-08");
  });

  it("falls back to the newest period when everything held is final (a stale month rolled over)", () => {
    expect(fromParamFor([entry("2026-08", true), entry("2026-07", true)])).toBe("2026-08");
  });
});

describe("mergePeriods", () => {
  it("replaces a period the server re-sent, keeps older ones, and stays newest-first", () => {
    const held = [
      entry("2026-09", false, 1),
      entry("2026-08", false, 2),
      entry("2026-07", true, 3),
    ];
    const incoming = [
      entry("2026-10", false, 9),
      entry("2026-09", true, 4),
      entry("2026-08", true, 2),
    ];

    const merged = mergePeriods(held, incoming);

    expect(merged.map((p) => p.period)).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
    expect(merged.find((p) => p.period === "2026-09")?.rides).toBe(4);
    expect(merged.find((p) => p.period === "2026-07")?.rides).toBe(3);
  });
});

describe("formatting", () => {
  it("shows units, thousands separators, and a dash for an unmeasured value", () => {
    expect(formatStatValue("distance", 1234.5)).toBe("1,234.5 km");
    expect(formatStatValue("rides", 12)).toBe("12");
    expect(formatStatValue("calories", null)).toBe("—");
  });

  it("gives no percentage against a zero or missing baseline", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(10, null)).toBeNull();
    expect(percentChange(null, 5)).toBeNull();
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
  });
});
