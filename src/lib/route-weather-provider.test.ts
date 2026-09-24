import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteWeatherPoint } from "./route-weather";
import { fetchRouteWeather, readRouteWeatherResponse } from "./route-weather-provider";

const T0 = Date.UTC(2026, 8, 26, 0, 0) / 1000; // midnight UTC, a whole day of hourly stamps

function hourlyBody(codes: number[], isDays: number[], temps: number[]) {
  return {
    hourly: {
      time: codes.map((_, i) => T0 + i * 3600),
      weathercode: codes,
      is_day: isDays,
      temperature_2m: temps,
    },
  };
}

const POINT: RouteWeatherPoint = { label: "Start", lat: 32, lng: 34.8, etaMs: 0 };

afterEach(() => vi.unstubAllGlobals());

describe("readRouteWeatherResponse", () => {
  it("reads the nearest whole hour to the ETA — no blending", () => {
    const body = hourlyBody(
      Array.from({ length: 24 }, (_, i) => i),
      Array.from({ length: 24 }, () => 1),
      Array.from({ length: 24 }, (_, i) => i),
    );
    const etaMs = (T0 + 3 * 3600 + 20 * 60) * 1000; // 03:20 — 20 min past the :00 stamp
    const [reading] = readRouteWeatherResponse(body, [{ ...POINT, etaMs }]);
    expect(reading.weatherCode).toBe(3);
    expect(reading.temperatureC).toBe(3);
  });

  it("reads one location per point, in the same order as the request", () => {
    const bodies = [hourlyBody([0], [1], [18]), hourlyBody([63], [0], [12])];
    const points: RouteWeatherPoint[] = [
      { label: "Start", lat: 0, lng: 0, etaMs: T0 * 1000 },
      { label: "Finish", lat: 1, lng: 1, etaMs: T0 * 1000 },
    ];
    const readings = readRouteWeatherResponse(bodies, points);
    expect(readings.map((r) => r.weatherCode)).toEqual([0, 63]);
    expect(readings.map((r) => r.isDay)).toEqual([true, false]);
  });

  it("reads a bare single-location object the same as a one-element array", () => {
    const body = hourlyBody([2], [1], [20]);
    expect(readRouteWeatherResponse(body, [{ ...POINT, etaMs: T0 * 1000 }])[0]?.weatherCode).toBe(
      2,
    );
  });

  it("is null, never a guess, when nothing is within an hour of the ETA", () => {
    const body = hourlyBody([0], [1], [18]);
    const farEtaMs = (T0 + 10 * 3600) * 1000;
    const [reading] = readRouteWeatherResponse(body, [{ ...POINT, etaMs: farEtaMs }]);
    expect(reading.weatherCode).toBeNull();
    expect(reading.isDay).toBeNull();
    expect(reading.temperatureC).toBeNull();
  });

  it("is null for a location with no hourly data at all", () => {
    const [reading] = readRouteWeatherResponse({}, [{ ...POINT, etaMs: T0 * 1000 }]);
    expect(reading.weatherCode).toBeNull();
  });
});

describe("fetchRouteWeather", () => {
  it("makes ONE request for every point, comma-joined", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [hourlyBody([0], [1], [18]), hourlyBody([61], [1], [16])],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const points: RouteWeatherPoint[] = [
      { label: "Start", lat: 32.1, lng: 34.8, etaMs: T0 * 1000 },
      { label: "Finish", lat: 32.9, lng: 35.2, etaMs: T0 * 1000 },
    ];
    const readings = await fetchRouteWeather({ points, signature: "s" });
    expect(readings).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("latitude")).toBe("32.1000,32.9000");
    expect(url.searchParams.get("longitude")).toBe("34.8000,35.2000");
    expect(url.searchParams.get("hourly")).toBe("weathercode,temperature_2m,is_day");
  });

  it("rejects on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    await expect(fetchRouteWeather({ points: [POINT], signature: "s" })).rejects.toThrow(/429/);
  });

  it("makes no request for an empty plan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRouteWeather({ points: [], signature: "s" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
