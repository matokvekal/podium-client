// The derived ride time — the one place this app computes a number a person did not state.
//
// That makes the guard rails the thing worth testing, not the arithmetic:
//
//   1. NO DISTANCE, NO ESTIMATE. Distance is the one input with no honest substitute; without
//      it the card must keep saying "soon" rather than invent a duration.
//   2. IT IS ALWAYS MARKED. formatEstimatedDuration is the only way it reaches a screen, and
//      the "~" is the entire difference between "the organizer says 2h 30m" and "we think ~2h 45m".
//   3. IT MOVES THE RIGHT WAY. More distance, more climb, rougher terrain, more rest stops and
//      a slower group must every one of them make the number bigger — never smaller, never flat.
//      Exact minutes are deliberately NOT asserted: they are tuned group speeds, and a test
//      that froze them would fail the next time somebody improves the model rather than breaks it.

import { describe, expect, it } from "vitest";
import {
  type DurationEstimateInput,
  estimateDurationMin,
  formatEstimatedDuration,
} from "./ride-duration";

/** A plain 40 km gravel ride with nothing else stated. */
function ride(overrides: Partial<DurationEstimateInput> = {}): DurationEstimateInput {
  return {
    distanceKm: 40,
    climbM: null,
    activityType: "gravel",
    terrainGrade: null,
    level: null,
    restStops: null,
    ...overrides,
  };
}

const minutes = (o: Partial<DurationEstimateInput> = {}) => estimateDurationMin(ride(o)) as number;

describe("⚠ when it refuses to answer", () => {
  it("returns null with no distance — the one thing it cannot do without", () => {
    expect(estimateDurationMin(ride({ distanceKm: null }))).toBeNull();
    expect(estimateDurationMin(ride({ distanceKm: undefined }))).toBeNull();
  });

  it("returns null for a zero or negative distance", () => {
    expect(estimateDurationMin(ride({ distanceKm: 0 }))).toBeNull();
    expect(estimateDurationMin(ride({ distanceKm: -10 }))).toBeNull();
  });

  it("returns null for a non-finite distance rather than NaN minutes", () => {
    expect(estimateDurationMin(ride({ distanceKm: Number.NaN }))).toBeNull();
    expect(estimateDurationMin(ride({ distanceKm: Number.POSITIVE_INFINITY }))).toBeNull();
  });

  it("still answers with NOTHING else stated — no climb, discipline, grade or level", () => {
    const only = estimateDurationMin({
      distanceKm: 40,
      climbM: null,
      activityType: null,
      terrainGrade: null,
      level: null,
      restStops: null,
    });
    expect(only).toBeGreaterThan(0);
  });
});

describe("it moves the right way", () => {
  it("more distance takes longer", () => {
    expect(minutes({ distanceKm: 80 })).toBeGreaterThan(minutes({ distanceKm: 40 }));
  });

  it("climb adds time, and a missing climb is treated as flat rather than refused", () => {
    expect(minutes({ climbM: 1200 })).toBeGreaterThan(minutes({ climbM: null }));
    expect(minutes({ climbM: 0 })).toBe(minutes({ climbM: null }));
  });

  it("⚠ rougher terrain takes longer at the same distance — the whole point of the grade", () => {
    const smooth = minutes({ terrainGrade: 1 });
    const rough = minutes({ terrainGrade: 5 });
    expect(rough).toBeGreaterThan(smooth);
    // And meaningfully so: G5 is not a rounding error away from G1.
    expect(rough).toBeGreaterThan(smooth * 1.5);
  });

  it("every grade step is slower than the one before it, on both scales", () => {
    for (const activityType of ["mtb", "gravel"] as const) {
      const byGrade = ([1, 2, 3, 4, 5] as const).map((terrainGrade) =>
        minutes({ activityType, terrainGrade }),
      );
      for (let i = 1; i < byGrade.length; i++) {
        expect(byGrade[i]).toBeGreaterThan(byGrade[i - 1]);
      }
    }
  });

  it("MTB is slower than gravel, which is slower than road, over the same ground", () => {
    const road = minutes({ activityType: "road" });
    const gravel = minutes({ activityType: "gravel" });
    const mtb = minutes({ activityType: "mtb" });
    expect(gravel).toBeGreaterThan(road);
    expect(mtb).toBeGreaterThan(gravel);
  });

  it("each rest stop adds time", () => {
    expect(minutes({ restStops: 2 })).toBeGreaterThan(minutes({ restStops: 0 }));
    expect(minutes({ restStops: 3 })).toBeGreaterThan(minutes({ restStops: 1 }));
  });

  it("a faster group is quicker than a beginners' group", () => {
    expect(minutes({ level: "world_tour" })).toBeLessThan(minutes({ level: "beginner" }));
  });

  it("uses the stated PACE for a run, not a multiplier on a guess", () => {
    // beginner is 7.5 min/km, world_tour is 3 — a 40 km run should differ by hours.
    const slow = minutes({ activityType: "running", level: "beginner" });
    const fast = minutes({ activityType: "running", level: "world_tour" });
    expect(slow).toBeGreaterThan(fast * 2);
    // 40 km at 7.5 min/km is 300 minutes of running; allow for rounding only.
    expect(slow).toBeGreaterThanOrEqual(295);
  });

  it("hiking is the slowest discipline", () => {
    const hike = minutes({ activityType: "hiking" });
    expect(hike).toBeGreaterThan(minutes({ activityType: "mtb" }));
  });
});

describe("the shape of the number", () => {
  it("is rounded to five minutes — finer would be false precision", () => {
    for (const distanceKm of [13, 27, 41, 68, 103]) {
      expect(minutes({ distanceKm }) % 5).toBe(0);
    }
  });

  it("never estimates zero for a very short ride", () => {
    expect(minutes({ distanceKm: 0.2 })).toBeGreaterThanOrEqual(5);
  });

  it("stays inside the server's own 48h bound", () => {
    expect(
      minutes({ distanceKm: 5000, climbM: 90000, activityType: "hiking" }),
    ).toBeLessThanOrEqual(2880);
  });

  it("gives a plausible figure for an ordinary ride, as a sanity check on the tuning", () => {
    // 60 km gravel, 600 m climb, intermediate, one stop: a real Saturday morning.
    const out = minutes({
      distanceKm: 60,
      climbM: 600,
      activityType: "gravel",
      terrainGrade: 2,
      level: "intermediate",
      restStops: 1,
    });
    expect(out).toBeGreaterThan(180); // more than 3h
    expect(out).toBeLessThan(330); // less than 5h30
  });
});

describe("⚠ formatEstimatedDuration — it always says it is an estimate", () => {
  it("prefixes a tilde", () => {
    expect(formatEstimatedDuration(165)).toBe("~2h 45m");
  });

  it("marks whole hours and sub-hour times too", () => {
    expect(formatEstimatedDuration(120)).toBe("~2h");
    expect(formatEstimatedDuration(45)).toBe("~45m");
  });

  it("renders nothing at all for no estimate — callers then show their own placeholder", () => {
    expect(formatEstimatedDuration(null)).toBe("");
    expect(formatEstimatedDuration(undefined)).toBe("");
    expect(formatEstimatedDuration(0)).toBe("");
  });
});
