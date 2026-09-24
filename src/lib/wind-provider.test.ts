import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openMeteoWindProvider,
  readOpenMeteoResponse,
  withinForecastHorizon,
} from "./wind-provider";

const T0 = Date.UTC(2026, 8, 26, 3, 0) / 1000; // 03:00 UTC, a whole hour stamp
const MS = (offsetMin: number) => (T0 + offsetMin * 60) * 1000;

/** Shape captured from the live API (timeformat=unixtime, timezone=UTC). */
function body(
  speeds: (number | null)[],
  dirs: (number | null)[],
  gusts: (number | null)[],
  temps?: (number | null)[],
  codes?: (number | null)[],
  isDays?: (number | null)[],
) {
  return {
    hourly_units: { time: "unixtime", wind_speed_10m: "km/h" },
    hourly: {
      time: speeds.map((_, i) => T0 + i * 3600),
      wind_speed_10m: speeds,
      wind_direction_10m: dirs,
      wind_gusts_10m: gusts,
      temperature_2m: temps ?? speeds.map(() => null),
      weathercode: codes,
      is_day: isDays,
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("readOpenMeteoResponse", () => {
  const data = body([10, 20, 30], [90, 90, 180], [14, 26, 40]);

  it("returns the stamp itself when a column lands exactly on an hour", () => {
    expect(readOpenMeteoResponse(data, [MS(0), MS(60)])).toEqual([
      {
        speedKmh: 10,
        directionDeg: 90,
        gustKmh: 14,
        temperatureC: null,
        weatherCode: null,
        isDay: null,
      },
      {
        speedKmh: 20,
        directionDeg: 90,
        gustKmh: 26,
        temperatureC: null,
        weatherCode: null,
        isDay: null,
      },
    ]);
  });

  it("blends a :30 column halfway between the two hours either side (a 06:30 ride)", () => {
    const [r] = readOpenMeteoResponse(data, [MS(30)]);
    expect(r?.speedKmh).toBeCloseTo(15, 6);
    expect(r?.gustKmh).toBeCloseTo(20, 6);
    expect(r?.directionDeg).toBeCloseTo(90, 6);
  });

  it("blends direction as vectors, so 350° and 10° meet at north, not at 180°", () => {
    const [r] = readOpenMeteoResponse(body([20, 20], [350, 10], [20, 20]), [MS(30)]);
    const d = r?.directionDeg ?? -1;
    expect(Math.min(d, 360 - d)).toBeLessThan(1);
  });

  it("reads the bare object a single location returns, and also a one-element array", () => {
    expect(readOpenMeteoResponse(data, [MS(0)])[0]?.speedKmh).toBe(10);
    expect(readOpenMeteoResponse([data], [MS(0)])[0]?.speedKmh).toBe(10);
  });

  it("gives null — never a guess — for holes, gaps and moments outside the series", () => {
    expect(readOpenMeteoResponse(body([10, null], [90, 90], [1, 1]), [MS(30)])).toEqual([null]);
    expect(readOpenMeteoResponse(data, [MS(-30)])).toEqual([null]); // before the first stamp
    expect(readOpenMeteoResponse(data, [MS(150)])).toEqual([null]); // after the last
    expect(readOpenMeteoResponse({}, [MS(0)])).toEqual([null]);
    expect(readOpenMeteoResponse(null, [MS(0)])).toEqual([null]);
  });

  it("blends temperature like the rest, and a missing temperature never breaks the wind", () => {
    const [warm] = readOpenMeteoResponse(body([10, 20], [90, 90], [14, 26], [18, 20]), [MS(30)]);
    expect(warm?.temperatureC).toBeCloseTo(19, 6);
    const [noTemp] = readOpenMeteoResponse(body([10, 20], [90, 90], [14, 26]), [MS(30)]);
    expect(noTemp?.temperatureC).toBeNull();
    expect(noTemp?.speedKmh).toBeCloseTo(15, 6);
  });

  it("a missing gust is a null gust, not a failure", () => {
    const [r] = readOpenMeteoResponse(body([10, 20], [90, 90], [null, null]), [MS(30)]);
    expect(r?.gustKmh).toBeNull();
    expect(r?.speedKmh).toBeCloseTo(15, 6);
  });

  it("sky condition is the nearest stamp, never blended — no half-rain, half-clear", () => {
    const withSky = body([10, 20], [90, 90], [14, 26], [18, 20], [0, 63], [1, 0]);
    const [closerToPrev] = readOpenMeteoResponse(withSky, [MS(10)]); // 10 min past :00
    expect(closerToPrev?.weatherCode).toBe(0);
    expect(closerToPrev?.isDay).toBe(true);
    const [closerToNext] = readOpenMeteoResponse(withSky, [MS(50)]); // 10 min before :60
    expect(closerToNext?.weatherCode).toBe(63);
    expect(closerToNext?.isDay).toBe(false);
  });

  it("missing weathercode/is_day is null, not a guess", () => {
    const [r] = readOpenMeteoResponse(data, [MS(0)]);
    expect(r?.weatherCode).toBeNull();
    expect(r?.isDay).toBeNull();
  });
});

describe("openMeteoWindProvider.fetchWind", () => {
  it("makes ONE request for ONE place: wind, air temperature and sky condition", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body([5, 6, 7], [90, 90, 90], [9, 9, 9]),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const readings = await openMeteoWindProvider.fetchWind({ lat: 32.0123456, lng: 34.8 }, [
      MS(0),
      MS(60),
    ]);
    expect(readings).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("32.0123");
    expect(url.searchParams.get("longitude")).toBe("34.8000");
    expect(url.searchParams.get("hourly")).toBe(
      "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,weathercode,is_day",
    );
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("start_date")).toBe("2026-09-26");
    expect(url.searchParams.get("end_date")).toBe("2026-09-26");
    // No rain/cloud amounts or daily aggregates — weathercode is the only sky-condition field.
    expect(url.search).not.toMatch(/precipitation|cloudcover|daily|rainfall|snowfall/);
  });

  it("reaches into the next UTC day when the last column is within an hour of midnight", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const late = Date.UTC(2026, 8, 26, 23, 30);
    await openMeteoWindProvider.fetchWind({ lat: 1, lng: 1 }, [late]);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("start_date")).toBe("2026-09-26");
    expect(url.searchParams.get("end_date")).toBe("2026-09-27");
  });

  it("rejects on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    await expect(openMeteoWindProvider.fetchWind({ lat: 1, lng: 1 }, [MS(0)])).rejects.toThrow(
      /429/,
    );
  });
});

describe("withinForecastHorizon", () => {
  const now = Date.UTC(2026, 8, 20, 12);
  it("accepts up to today + 15 days (UTC) and refuses beyond", () => {
    expect(withinForecastHorizon(openMeteoWindProvider, Date.UTC(2026, 9, 5, 22, 30), now)).toBe(
      true,
    );
    expect(withinForecastHorizon(openMeteoWindProvider, Date.UTC(2026, 9, 5, 23, 30), now)).toBe(
      false,
    );
  });
});
