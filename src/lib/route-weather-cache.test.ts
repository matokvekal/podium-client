import { describe, expect, it } from "vitest";
import {
  isRouteWeatherCacheFresh,
  ROUTE_WEATHER_CACHE_PREFIX,
  ROUTE_WEATHER_CACHE_TTL_MS,
  type RouteWeatherStorage,
  readRouteWeatherCache,
  routeWeatherCacheKey,
  writeRouteWeatherCache,
} from "./route-weather-cache";

function memoryStorage(
  seed: Record<string, string> = {},
): RouteWeatherStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const READING = {
  label: "Start",
  lat: 32,
  lng: 34.8,
  etaMs: 1_000,
  weatherCode: 0,
  isDay: true,
  temperatureC: 18,
};

describe("routeWeatherCacheKey", () => {
  it("is scoped by user AND event, under its own prefix", () => {
    expect(routeWeatherCacheKey("u1", "e1")).toBe(`${ROUTE_WEATHER_CACHE_PREFIX}u1.e1`);
  });
});

describe("read/write round trip", () => {
  it("writes and reads back the same entry for the same user, event and signature", () => {
    const storage = memoryStorage();
    writeRouteWeatherCache(
      { userId: "u1", eventId: "e1", signature: "s1", generatedAt: 5000, samples: [READING] },
      storage,
    );
    const entry = readRouteWeatherCache("u1", "e1", "s1", storage);
    expect(entry?.samples).toEqual([READING]);
    expect(entry?.generatedAt).toBe(5000);
  });

  it("never crosses users or events, even with the same signature", () => {
    const storage = memoryStorage();
    writeRouteWeatherCache(
      { userId: "u1", eventId: "e1", signature: "s1", generatedAt: 5000, samples: [READING] },
      storage,
    );
    expect(readRouteWeatherCache("u2", "e1", "s1", storage)).toBeNull();
    expect(readRouteWeatherCache("u1", "e2", "s1", storage)).toBeNull();
  });

  it("is a miss once the ride, start or duration changes the signature", () => {
    const storage = memoryStorage();
    writeRouteWeatherCache(
      { userId: "u1", eventId: "e1", signature: "s1", generatedAt: 5000, samples: [READING] },
      storage,
    );
    expect(readRouteWeatherCache("u1", "e1", "s2", storage)).toBeNull();
  });
});

describe("isRouteWeatherCacheFresh", () => {
  it("fresh inside the 5 h TTL, stale at and past it", () => {
    const entry = {
      v: 1,
      userId: "u1",
      eventId: "e1",
      signature: "s1",
      generatedAt: 10_000,
      samples: [READING],
    };
    expect(isRouteWeatherCacheFresh(entry, 10_000)).toBe(true);
    expect(isRouteWeatherCacheFresh(entry, 10_000 + ROUTE_WEATHER_CACHE_TTL_MS - 1)).toBe(true);
    expect(isRouteWeatherCacheFresh(entry, 10_000 + ROUTE_WEATHER_CACHE_TTL_MS)).toBe(false);
  });

  it("a future generatedAt (clock change) is not fresh", () => {
    const entry = {
      v: 1,
      userId: "u1",
      eventId: "e1",
      signature: "s1",
      generatedAt: 10_000,
      samples: [READING],
    };
    expect(isRouteWeatherCacheFresh(entry, 5_000)).toBe(false);
  });
});

describe("hygiene", () => {
  it("treats corrupt, foreign-version or malformed-sample entries as a miss", () => {
    const storage = memoryStorage({
      [routeWeatherCacheKey("u1", "a")]: "not json",
      [routeWeatherCacheKey("u1", "b")]: JSON.stringify({
        v: 99,
        userId: "u1",
        eventId: "b",
        signature: "s",
        generatedAt: 1,
        samples: [READING],
      }),
      [routeWeatherCacheKey("u1", "c")]: JSON.stringify({
        v: 1,
        userId: "u1",
        eventId: "c",
        signature: "s",
        generatedAt: 1,
        samples: [{ nope: 1 }],
      }),
    });
    expect(readRouteWeatherCache("u1", "a", "s", storage)).toBeNull();
    expect(readRouteWeatherCache("u1", "b", "s", storage)).toBeNull();
    expect(readRouteWeatherCache("u1", "c", "s", storage)).toBeNull();
  });

  it("survives storage that throws — a write failure never breaks the caller", () => {
    const hostile: RouteWeatherStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    };
    expect(readRouteWeatherCache("u1", "e1", "s1", hostile)).toBeNull();
    expect(() =>
      writeRouteWeatherCache(
        { userId: "u1", eventId: "e1", signature: "s1", generatedAt: 1, samples: [READING] },
        hostile,
      ),
    ).not.toThrow();
  });

  it("works with no storage at all", () => {
    expect(readRouteWeatherCache("u1", "e1", "s1", null)).toBeNull();
    expect(() =>
      writeRouteWeatherCache(
        { userId: "u1", eventId: "e1", signature: "s1", generatedAt: 1, samples: [READING] },
        null,
      ),
    ).not.toThrow();
  });
});
