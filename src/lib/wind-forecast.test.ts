import { describe, expect, it, vi } from "vitest";
import {
  isWindCacheFresh,
  pruneWindCache,
  readWindCache,
  WIND_CACHE_PREFIX,
  WIND_CACHE_TTL_MS,
  type WindStorage,
  windCacheKey,
  writeWindCache,
} from "./wind-cache";
import { loadWindForecast } from "./wind-forecast";
import { planWindWindow } from "./wind-model";
import type { WindProvider } from "./wind-provider";

function memoryStorage(
  seed: Record<string, string> = {},
): WindStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const ROUTE: [number, number][] = [
  [32, 34.8],
  [32.05, 34.85],
  [32.1, 34.9],
];
const START = Date.UTC(2026, 8, 26, 4, 0); // Saturday 07:00 Israel
const plan = planWindWindow({ points: ROUTE, startMs: START, durationMin: 90 });
if (!plan) throw new Error("test route should plan");

function fakeProvider(): WindProvider & { calls: number } {
  const provider = {
    id: "fake",
    horizonDays: 15,
    calls: 0,
    async fetchWind(_place: unknown, timesMs: readonly number[]) {
      provider.calls++;
      return timesMs.map(() => ({
        speedKmh: 14,
        directionDeg: 270,
        gustKmh: 22,
        temperatureC: 19,
        weatherCode: 2,
        isDay: true,
      }));
    },
  };
  return provider;
}

const HOUR = 3_600_000;
// Thursday 09:00 — two days before the ride.
const THURSDAY = Date.UTC(2026, 8, 24, 6, 0);

describe("loadWindForecast", () => {
  it("fetches once, stores locally, and serves the next open from the cache", async () => {
    const storage = memoryStorage();
    const provider = fakeProvider();

    const first = await loadWindForecast({
      eventId: "e1",
      plan,
      nowMs: THURSDAY,
      provider,
      storage,
    });
    expect(first?.source).toBe("network");
    expect(first?.samples).toHaveLength(plan.timesMs.length);
    expect(provider.calls).toBe(1);
    expect(storage.data.has(windCacheKey("e1"))).toBe(true);

    const second = await loadWindForecast({
      eventId: "e1",
      plan,
      nowMs: THURSDAY + HOUR,
      provider,
      storage,
    });
    expect(second?.source).toBe("cache");
    expect(second?.fetchedAt).toBe(THURSDAY);
    expect(provider.calls).toBe(1);
  });

  it("refetches and REPLACES the cache once the 3 h TTL has passed", async () => {
    const storage = memoryStorage();
    const provider = fakeProvider();
    await loadWindForecast({ eventId: "e1", plan, nowMs: THURSDAY, provider, storage });

    const later = THURSDAY + WIND_CACHE_TTL_MS + 1;
    const again = await loadWindForecast({ eventId: "e1", plan, nowMs: later, provider, storage });
    expect(again?.source).toBe("network");
    expect(provider.calls).toBe(2);
    expect(readWindCache("e1", `fake|${plan.signature}`, storage)?.fetchedAt).toBe(later);
  });

  it("does not reuse a forecast made for a different start time, route or duration", async () => {
    const storage = memoryStorage();
    const provider = fakeProvider();
    await loadWindForecast({ eventId: "e1", plan, nowMs: THURSDAY, provider, storage });

    const moved = planWindWindow({ points: ROUTE, startMs: START + 86_400_000, durationMin: 90 });
    if (!moved) throw new Error("plan");
    const result = await loadWindForecast({
      eventId: "e1",
      plan: moved,
      nowMs: THURSDAY + 1000,
      provider,
      storage,
    });
    expect(result?.source).toBe("network");
    expect(provider.calls).toBe(2);
  });

  it("keeps each event's cache separate", async () => {
    const storage = memoryStorage();
    const provider = fakeProvider();
    await loadWindForecast({ eventId: "e1", plan, nowMs: THURSDAY, provider, storage });
    await loadWindForecast({ eventId: "e2", plan, nowMs: THURSDAY, provider, storage });
    expect(provider.calls).toBe(2);
    expect([...storage.data.keys()].sort()).toEqual([windCacheKey("e1"), windCacheKey("e2")]);
  });

  it("falls back to the older cache, honestly labelled, when the refresh fails", async () => {
    const storage = memoryStorage();
    await loadWindForecast({
      eventId: "e1",
      plan,
      nowMs: THURSDAY,
      provider: fakeProvider(),
      storage,
    });

    const broken: WindProvider = {
      id: "fake",
      horizonDays: 15,
      fetchWind: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    const result = await loadWindForecast({
      eventId: "e1",
      plan,
      nowMs: THURSDAY + 5 * HOUR,
      provider: broken,
      storage,
    });
    expect(result?.source).toBe("stale-cache");
    expect(result?.fetchedAt).toBe(THURSDAY);
  });

  it("shows nothing when the fetch fails and there is no cache", async () => {
    const broken: WindProvider = {
      id: "fake",
      horizonDays: 15,
      fetchWind: async () => {
        throw new Error("offline");
      },
    };
    expect(
      await loadWindForecast({
        eventId: "e1",
        plan,
        nowMs: THURSDAY,
        provider: broken,
        storage: memoryStorage(),
      }),
    ).toBeNull();
  });

  it("makes no request for a ride beyond the forecast horizon, or long finished", async () => {
    const provider = fakeProvider();
    const storage = memoryStorage();
    // 20 days before the ride.
    expect(
      await loadWindForecast({
        eventId: "e1",
        plan,
        nowMs: START - 20 * 86_400_000,
        provider,
        storage,
      }),
    ).toBeNull();
    // Ride finished hours ago.
    expect(
      await loadWindForecast({ eventId: "e1", plan, nowMs: START + 6 * HOUR, provider, storage }),
    ).toBeNull();
    expect(provider.calls).toBe(0);
    expect(storage.data.size).toBe(0);
  });

  it("still works with no storage at all", async () => {
    const result = await loadWindForecast({
      eventId: "e1",
      plan,
      nowMs: THURSDAY,
      provider: fakeProvider(),
      storage: null,
    });
    expect(result?.source).toBe("network");
  });
});

describe("wind cache hygiene", () => {
  const sample = {
    timeMs: START,
    speedKmh: 1,
    directionDeg: 1,
    gustKmh: null,
    temperatureC: null,
    weatherCode: null,
    isDay: null,
  };

  it("treats corrupt or foreign-version entries as a miss", () => {
    const storage = memoryStorage({
      [windCacheKey("a")]: "not json",
      [windCacheKey("b")]: JSON.stringify({
        v: 99,
        eventId: "b",
        signature: "s",
        fetchedAt: 1,
        samples: [sample],
      }),
      [windCacheKey("c")]: JSON.stringify({
        v: 4,
        eventId: "c",
        signature: "s",
        fetchedAt: 1,
        samples: [{ nope: 1 }],
      }),
    });
    expect(readWindCache("a", "s", storage)).toBeNull();
    expect(readWindCache("b", "s", storage)).toBeNull();
    expect(readWindCache("c", "s", storage)).toBeNull();
  });

  it("a future fetchedAt (clock change) is not fresh", () => {
    expect(
      isWindCacheFresh(
        { v: 4, eventId: "a", signature: "s", fetchedAt: 5000, samples: [sample] },
        1000,
      ),
    ).toBe(false);
  });

  it("prunes entries for rides more than a day gone, leaves the rest and other keys alone", () => {
    const old = { ...sample, timeMs: START - 3 * 86_400_000 };
    const storage = memoryStorage({
      [`${WIND_CACHE_PREFIX}old`]: JSON.stringify({
        v: 4,
        eventId: "old",
        signature: "s",
        fetchedAt: 1,
        samples: [old],
      }),
      [`${WIND_CACHE_PREFIX}new`]: JSON.stringify({
        v: 4,
        eventId: "new",
        signature: "s",
        fetchedAt: 1,
        samples: [sample],
      }),
      "podium.other": "keep",
    });
    pruneWindCache(START, storage);
    expect([...storage.data.keys()].sort()).toEqual([`${WIND_CACHE_PREFIX}new`, "podium.other"]);
  });

  it("survives storage that throws", () => {
    const hostile = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    } as WindStorage;
    expect(readWindCache("a", "s", hostile)).toBeNull();
    expect(() =>
      writeWindCache({ eventId: "a", signature: "s", fetchedAt: 1, samples: [sample] }, 1, hostile),
    ).not.toThrow();
  });
});
