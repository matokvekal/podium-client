import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampSpeed,
  clampWeight,
  climbFactor,
  DEFAULT_SPEED_BY_LEVEL,
  defaultSpeedForLevel,
  energyLevel,
  estimateCalories,
  formatKcal,
  formatSpeed,
  metForSpeed,
  readStoredSpeed,
  readStoredWeight,
  SPEED_STORAGE_KEY,
  storeSpeed,
  storeWeight,
  WEIGHT_STORAGE_KEY,
} from "./calories";

describe("metForSpeed", () => {
  it("returns the anchor value at each anchor speed", () => {
    expect(metForSpeed(14)).toBeCloseTo(4.0);
    expect(metForSpeed(17.6)).toBeCloseTo(6.8);
    expect(metForSpeed(20.8)).toBeCloseTo(8.0);
    expect(metForSpeed(24)).toBeCloseTo(10.0);
    expect(metForSpeed(28.2)).toBeCloseTo(12.0);
    expect(metForSpeed(34)).toBeCloseTo(15.8);
  });

  it("interpolates between anchors", () => {
    expect(metForSpeed(22.4)).toBeCloseTo(9.0); // halfway between 20.8 and 24
    expect(metForSpeed(26.1)).toBeCloseTo(11.0); // halfway between 24 and 28.2
  });

  it("is flat outside the anchored range", () => {
    expect(metForSpeed(5)).toBeCloseTo(4.0);
    expect(metForSpeed(60)).toBeCloseTo(15.8);
  });

  it("rises with speed across the whole slider range", () => {
    for (let kmh = 20; kmh < 34; kmh += 0.5) {
      expect(metForSpeed(kmh + 0.5)).toBeGreaterThan(metForSpeed(kmh));
    }
  });
});

describe("climbFactor", () => {
  it("is 1 on a flat ride and on a missing climb", () => {
    expect(climbFactor(40, 0)).toBe(1);
    expect(climbFactor(40, null)).toBe(1);
    expect(climbFactor(40, undefined)).toBe(1);
  });

  it("grows with metres per km", () => {
    expect(climbFactor(100, 500)).toBeCloseTo(1.03); // 5 m/km
    expect(climbFactor(50, 500)).toBeCloseTo(1.06); // 10 m/km
  });

  it("caps at +15%, however steep the ride", () => {
    expect(climbFactor(50, 1250)).toBeCloseTo(1.15); // 25 m/km — the cap
    expect(climbFactor(50, 3000)).toBeCloseTo(1.15); // 60 m/km — still the cap
  });

  it("is 1 for a distance that cannot be divided by", () => {
    expect(climbFactor(0, 500)).toBe(1);
    expect(climbFactor(-10, 500)).toBe(1);
  });
});

describe("estimateCalories", () => {
  it("estimates a known flat ride", () => {
    // 40 km at 28 km/h = 1.4286 h, MET 11.905, 70 kg -> 1190.5 kcal -> nearest 5
    expect(estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 70, speedKmh: 28 })).toBe(1190);
  });

  it("adds the climb bonus", () => {
    // same ride with 400 m of climb (10 m/km) -> x1.06
    expect(estimateCalories({ distanceKm: 40, climbM: 400, weightKg: 70, speedKmh: 28 })).toBe(
      1260,
    );
  });

  it("treats a missing climb as flat", () => {
    const flat = estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 70, speedKmh: 28 });
    expect(estimateCalories({ distanceKm: 40, climbM: null, weightKg: 70, speedKmh: 28 })).toBe(
      flat,
    );
  });

  it("always lands on a multiple of 5 — it is an estimate, not a measurement", () => {
    for (let kmh = 20; kmh <= 34; kmh += 0.5) {
      const kcal = estimateCalories({ distanceKm: 63.7, climbM: 812, weightKg: 83, speedKmh: kmh });
      expect(kcal).not.toBeNull();
      expect((kcal as number) % 5).toBe(0);
    }
  });

  it("scales with weight", () => {
    const light = estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 60, speedKmh: 28 });
    const heavy = estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 100, speedKmh: 28 });
    expect(heavy as number).toBeGreaterThan(light as number);
  });

  it("returns null without a usable distance", () => {
    const rider = { climbM: 500, weightKg: 70, speedKmh: 28 };
    expect(estimateCalories({ distanceKm: null, ...rider })).toBeNull();
    expect(estimateCalories({ distanceKm: undefined, ...rider })).toBeNull();
    expect(estimateCalories({ distanceKm: 0, ...rider })).toBeNull();
    expect(estimateCalories({ distanceKm: -5, ...rider })).toBeNull();
    expect(estimateCalories({ distanceKm: Number.NaN, ...rider })).toBeNull();
  });

  it("clamps the rider inputs before using them", () => {
    const clamped = estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 500, speedKmh: 90 });
    const bounds = estimateCalories({ distanceKm: 40, climbM: 0, weightKg: 120, speedKmh: 34 });
    expect(clamped).toBe(bounds);
  });
});

describe("clamps", () => {
  it("keeps weight inside 40–120 and whole", () => {
    expect(clampWeight(70)).toBe(70);
    expect(clampWeight(70.6)).toBe(71);
    expect(clampWeight(12)).toBe(40);
    expect(clampWeight(500)).toBe(120);
    expect(clampWeight(Number.NaN)).toBe(70);
  });

  it("keeps speed inside 20–34 and on the 0.5 step", () => {
    expect(clampSpeed(28)).toBe(28);
    expect(clampSpeed(28.5)).toBe(28.5);
    expect(clampSpeed(28.37)).toBe(28.5);
    expect(clampSpeed(28.1)).toBe(28);
    expect(clampSpeed(5)).toBe(20);
    expect(clampSpeed(99)).toBe(34);
    expect(clampSpeed(Number.NaN)).toBe(27);
  });
});

describe("defaultSpeedForLevel", () => {
  it("maps every one of the app's five ride levels", () => {
    expect(defaultSpeedForLevel("beginner")).toBe(22);
    expect(defaultSpeedForLevel("intermediate")).toBe(25);
    expect(defaultSpeedForLevel("masters")).toBe(28);
    expect(defaultSpeedForLevel("elite")).toBe(31);
    expect(defaultSpeedForLevel("world_tour")).toBe(34);
  });

  it("falls back to the middle of the slider when the ride has no level", () => {
    expect(defaultSpeedForLevel(null)).toBe(27);
    expect(defaultSpeedForLevel(undefined)).toBe(27);
  });

  it("offers only speeds the slider can actually reach", () => {
    for (const speed of Object.values(DEFAULT_SPEED_BY_LEVEL)) {
      expect(clampSpeed(speed)).toBe(speed);
    }
  });
});

describe("energyLevel", () => {
  it("runs cool at the bottom of the slider and hot at the top", () => {
    expect(energyLevel(20)).toBe(1);
    expect(energyLevel(22.5)).toBe(1);
    expect(energyLevel(23)).toBe(2);
    expect(energyLevel(26)).toBe(3);
    expect(energyLevel(29)).toBe(4);
    expect(energyLevel(32)).toBe(5);
    expect(energyLevel(34)).toBe(5);
  });

  it("never goes backwards as the slider moves up", () => {
    let last = 0;
    for (let kmh = 20; kmh <= 34; kmh += 0.5) {
      const level = energyLevel(kmh);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
    expect(last).toBe(5);
  });

  it("stays inside the five tokens for out-of-range input", () => {
    expect(energyLevel(-5)).toBe(1);
    expect(energyLevel(200)).toBe(5);
  });
});

describe("formatting", () => {
  it("groups thousands", () => {
    expect(formatKcal(1120)).toBe("1,120");
    expect(formatKcal(940)).toBe("940");
  });

  it("prints speed at the slider's own granularity", () => {
    expect(formatSpeed(28)).toBe("28");
    expect(formatSpeed(30.5)).toBe("30.5");
  });
});

// The test environment is node — there is no window — so each case installs exactly the
// storage it wants to test against.
function stubStorage(store: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  });
}

describe("stored preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads back what was written", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    storeWeight(83);
    storeSpeed(30.5);
    expect(store[WEIGHT_STORAGE_KEY]).toBe("83");
    expect(store[SPEED_STORAGE_KEY]).toBe("30.5");
    expect(readStoredWeight()).toBe(83);
    expect(readStoredSpeed()).toBe(30.5);
  });

  it("returns null for nothing stored", () => {
    stubStorage({});
    expect(readStoredWeight()).toBeNull();
    expect(readStoredSpeed()).toBeNull();
  });

  it("rejects junk and out-of-range values rather than clamping them", () => {
    for (const bad of ["abc", "", "  ", "NaN", "0", "500", "-70"]) {
      stubStorage({ [WEIGHT_STORAGE_KEY]: bad, [SPEED_STORAGE_KEY]: bad });
      expect(readStoredWeight()).toBeNull();
      expect(readStoredSpeed()).toBeNull();
    }
  });

  it("snaps a stored in-range speed onto the slider step", () => {
    stubStorage({ [SPEED_STORAGE_KEY]: "28.37" });
    expect(readStoredSpeed()).toBe(28.5);
  });

  it("survives a browser that throws on any storage access", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("access denied");
      },
    });
    expect(readStoredWeight()).toBeNull();
    expect(readStoredSpeed()).toBeNull();
    expect(() => storeWeight(70)).not.toThrow();
    expect(() => storeSpeed(28)).not.toThrow();
  });

  it("survives no window at all", () => {
    vi.stubGlobal("window", undefined);
    expect(readStoredWeight()).toBeNull();
    expect(() => storeWeight(70)).not.toThrow();
  });
});
