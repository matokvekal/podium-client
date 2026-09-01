import { describe, expect, it } from "vitest";
import {
  DURATION_HOUR_OPTIONS,
  DURATION_MINUTE_OPTIONS,
  formatDuration,
  joinDuration,
  MAX_DURATION_MIN,
  splitDuration,
} from "./ride-duration";

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(165)).toBe("2h 45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("returns an empty string for nothing", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});

describe("splitDuration / joinDuration", () => {
  it("splits whole minutes into the two dropdown values", () => {
    expect(splitDuration(165)).toEqual({ hours: 2, mins: 45 });
    expect(splitDuration(120)).toEqual({ hours: 2, mins: 0 });
    expect(splitDuration(45)).toEqual({ hours: 0, mins: 45 });
    expect(splitDuration(90)).toEqual({ hours: 1, mins: 30 });
  });

  it("keeps 'not stated' distinct from zero in both directions", () => {
    expect(splitDuration(null)).toEqual({ hours: null, mins: null });
    expect(splitDuration(undefined)).toEqual({ hours: null, mins: null });
    expect(splitDuration(0)).toEqual({ hours: null, mins: null });
    expect(joinDuration(null, null)).toBeNull();
    expect(joinDuration(0, 0)).toBeNull();
    expect(joinDuration(0, null)).toBeNull();
  });

  it("round-trips every value the picker can produce", () => {
    for (const hours of DURATION_HOUR_OPTIONS) {
      for (const mins of DURATION_MINUTE_OPTIONS) {
        const total = joinDuration(hours, mins);
        if (total === null) {
          // The single unset-looking combination: 0h 00m.
          expect(hours === 0 && mins === 0).toBe(true);
          continue;
        }
        expect(total).toBeLessThanOrEqual(MAX_DURATION_MIN);
        const back = splitDuration(total);
        expect(joinDuration(back.hours, back.mins)).toBe(total);
      }
    }
  });

  it("treats a missing half as zero rather than as unset", () => {
    expect(joinDuration(2, null)).toBe(120);
    expect(joinDuration(null, 30)).toBe(30);
  });

  it("never emits a value the server would reject", () => {
    // 48h 55m is reachable in the UI; the server bound is 48h exactly.
    expect(joinDuration(48, 55)).toBe(MAX_DURATION_MIN);
    expect(splitDuration(9999)).toEqual({ hours: 48, mins: 0 });
  });

  it("offers the full server range and no more", () => {
    expect(DURATION_HOUR_OPTIONS[0]).toBe(0);
    expect(DURATION_HOUR_OPTIONS.at(-1)).toBe(MAX_DURATION_MIN / 60);
    expect(DURATION_MINUTE_OPTIONS).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });
});
