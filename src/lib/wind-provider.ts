// The weather-provider seam for the wind pilot: everything the feature needs from a forecast
// source is `WindProvider`, and Open-Meteo is one implementation of it. Swapping providers later
// means writing another object with this shape — nothing in wind-model / wind-forecast / the UI
// knows Open-Meteo exists.
//
// Open-Meteo (https://open-meteo.com/en/docs — parameters below verified against the live API
// 2026-09-20): free for non-commercial use, no key, CORS open, so the browser calls it directly,
// like lib/weather.ts and the OSM tiles. Its licence (CC BY 4.0) requires attribution, which the
// wind strip carries.
//
//   GET https://api.open-meteo.com/v1/forecast
//     latitude / longitude                 one location — the pilot asks about one place per ride
//     hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m
//     wind_speed_unit=kmh                  the default, sent anyway so it can never drift
//     timeformat=unixtime & timezone=UTC   hour stamps as epoch seconds: no timezone parsing
//     start_date / end_date                bounds the payload to the ride's day(s)
//   Forecast range: today … today + 15 days (forecast_days max 16); beyond that the API 400s.
//   wind_direction_10m is degrees the wind blows FROM (meteorological).

/** The provider's answer for one instant. Speeds in km/h, direction = where the wind blows FROM. */
export interface WindReading {
  speedKmh: number;
  directionDeg: number;
  gustKmh: number | null;
  /** °C at 2 m. Null when the provider sent none — the wind readings do not depend on it. */
  temperatureC: number | null;
}

export interface WindProvider {
  /** Part of the cache signature: a cached forecast from another provider must not be reused. */
  readonly id: string;
  /** How many days ahead this provider can forecast, counted from today (UTC). */
  readonly horizonDays: number;
  /**
   * One reading per requested instant, in order — null where the provider had nothing for it.
   * Rejects when the request itself fails; never invents a value.
   */
  fetchWind(
    place: { lat: number; lng: number },
    timesMs: readonly number[],
    signal?: AbortSignal,
  ): Promise<(WindReading | null)[]>;
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const DAY_MS = 86_400_000;
const HOUR_S = 3600;

function utcDay(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

interface OpenMeteoBody {
  hourly?: {
    time?: number[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    temperature_2m?: (number | null)[];
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * The reading at `timeMs`, blended from the two hourly stamps either side of it (or taken as is
 * when it lands exactly on one). The forecast window is anchored to the RIDE's start, so a 06:30
 * ride asks for 05:30 — halfway between two stamps. Speed and gust blend linearly; direction is
 * blended as vectors, so 350° and 10° meet at north rather than at 180°.
 */
function readingAt(
  times: readonly number[],
  speeds: readonly (number | null)[],
  dirs: readonly (number | null)[],
  gusts: readonly (number | null)[] | undefined,
  temps: readonly (number | null)[] | undefined,
  timeMs: number,
): WindReading | null {
  const seconds = timeMs / 1000;
  let next = times.findIndex((t) => t >= seconds);
  if (next < 0) return null;
  // Exactly on a stamp: that stamp alone.
  const exact = times[next] === seconds;
  const prev = exact ? next : next - 1;
  if (prev < 0) return null;
  if (!exact && times[next] - times[prev] > HOUR_S * 1.5) return null; // a gap in the series
  if (exact) next = prev;

  const sa = speeds[prev];
  const sb = speeds[next];
  const da = dirs[prev];
  const db = dirs[next];
  if (typeof sa !== "number" || typeof sb !== "number") return null;
  if (typeof da !== "number" || typeof db !== "number") return null;

  const w = prev === next ? 0 : (seconds - times[prev]) / (times[next] - times[prev]);
  const speedKmh = sa + (sb - sa) * w;

  const x = (1 - w) * sa * Math.sin(toRad(da)) + w * sb * Math.sin(toRad(db));
  const y = (1 - w) * sa * Math.cos(toRad(da)) + w * sb * Math.cos(toRad(db));
  // Opposing winds cancel to nothing: fall back to whichever stamp is nearer.
  const directionDeg =
    Math.hypot(x, y) < 1e-6
      ? w < 0.5
        ? da
        : db
      : ((((Math.atan2(x, y) * 180) / Math.PI) % 360) + 360) % 360;

  const ga = gusts?.[prev];
  const gb = gusts?.[next];
  const gustKmh = typeof ga === "number" && typeof gb === "number" ? ga + (gb - ga) * w : null;

  const ta = temps?.[prev];
  const tb = temps?.[next];
  const temperatureC = typeof ta === "number" && typeof tb === "number" ? ta + (tb - ta) * w : null;

  return { speedKmh, directionDeg, gustKmh, temperatureC };
}

/** Pure, so it can be tested against a captured response without a network. */
export function readOpenMeteoResponse(
  body: unknown,
  timesMs: readonly number[],
): (WindReading | null)[] {
  const parsed = (Array.isArray(body) ? body[0] : body) as OpenMeteoBody | undefined;
  const hourly = parsed?.hourly;
  const times = hourly?.time;
  const speeds = hourly?.wind_speed_10m;
  const dirs = hourly?.wind_direction_10m;
  if (!Array.isArray(times) || !Array.isArray(speeds) || !Array.isArray(dirs)) {
    return timesMs.map(() => null);
  }
  return timesMs.map((t) =>
    readingAt(times, speeds, dirs, hourly?.wind_gusts_10m, hourly?.temperature_2m, t),
  );
}

export const openMeteoWindProvider: WindProvider = {
  id: "open-meteo",
  horizonDays: 15,

  async fetchWind(place, timesMs, signal) {
    if (timesMs.length === 0) return [];

    const url = new URL(OPEN_METEO_URL);
    // 4 decimals ≈ 11 m: far finer than the model's ~11 km grid.
    url.searchParams.set("latitude", place.lat.toFixed(4));
    url.searchParams.set("longitude", place.lng.toFixed(4));
    url.searchParams.set(
      "hourly",
      "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m",
    );
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("timeformat", "unixtime");
    url.searchParams.set("timezone", "UTC");
    // The UTC days the window touches. The end reaches one hour past the last column, because a
    // column at 23:30 is blended with the 00:00 stamp of the next day.
    url.searchParams.set("start_date", utcDay(Math.min(...timesMs)));
    url.searchParams.set("end_date", utcDay(Math.max(...timesMs) + HOUR_S * 1000));

    const response = await fetch(url.toString(), { signal });
    if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
    return readOpenMeteoResponse(await response.json(), timesMs);
  },
};

/**
 * Is the whole window inside the provider's forecast range? Outside it there is nothing to ask —
 * a ride three weeks out simply has no wind strip yet, and no request is made. `lastMs` is the
 * last column; the provider is also asked for the hour after it (see fetchWind).
 */
export function withinForecastHorizon(
  provider: WindProvider,
  lastMs: number,
  nowMs: number,
): boolean {
  return utcDay(lastMs + HOUR_S * 1000) <= utcDay(nowMs + provider.horizonDays * DAY_MS);
}
