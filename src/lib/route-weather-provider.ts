// Route weather — the network part: one batched Open-Meteo request for every sampled point on
// the route, each read at its own estimated arrival time. No blending, no interpolation: the
// forecast for the WHOLE HOUR nearest the ETA, matching the plan's own proportional (already
// approximate) ETA.
//
// Open-Meteo accepts several locations in one request (comma-separated latitude/longitude),
// returning one hourly block per location in the SAME ORDER — so a 5-point route costs exactly
// one HTTP request, never one per point.

import type { RouteWeatherPlan, RouteWeatherPoint } from "./route-weather";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const HOUR_S = 3600;

export interface RouteWeatherReading {
  label: string;
  lat: number;
  lng: number;
  etaMs: number;
  weatherCode: number | null;
  isDay: boolean | null;
  temperatureC: number | null;
}

function utcDay(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

interface OpenMeteoHourly {
  time?: number[];
  weathercode?: (number | null)[];
  temperature_2m?: (number | null)[];
  is_day?: (number | null)[];
}

interface OpenMeteoBody {
  hourly?: OpenMeteoHourly;
}

function nearestReading(
  hourly: OpenMeteoHourly | undefined,
  etaMs: number,
): { weatherCode: number | null; isDay: boolean | null; temperatureC: number | null } {
  const times = hourly?.time;
  const empty = { weatherCode: null, isDay: null, temperatureC: null };
  if (!Array.isArray(times) || times.length === 0) return empty;

  const targetS = Math.round(etaMs / 1000);
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i] - targetS);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  if (bestDiff > HOUR_S) return empty; // nothing close enough to be honest about

  const code = hourly?.weathercode?.[bestIndex];
  const isDayAt = hourly?.is_day?.[bestIndex];
  const temp = hourly?.temperature_2m?.[bestIndex];
  return {
    weatherCode: typeof code === "number" ? code : null,
    isDay: typeof isDayAt === "number" ? isDayAt === 1 : null,
    temperatureC: typeof temp === "number" ? temp : null,
  };
}

/** Pure, so it can be tested against a captured response without a network. Reads a single
 * location's bare object the same as a one-element array, like Open-Meteo itself does. */
export function readRouteWeatherResponse(
  body: unknown,
  planPoints: readonly RouteWeatherPoint[],
): RouteWeatherReading[] {
  const bodies = Array.isArray(body) ? (body as OpenMeteoBody[]) : [body as OpenMeteoBody];
  return planPoints.map((point, i) => {
    const reading = nearestReading(bodies[i]?.hourly, point.etaMs);
    return { label: point.label, lat: point.lat, lng: point.lng, etaMs: point.etaMs, ...reading };
  });
}

/**
 * One batched request for every point in the plan. Rejects on any transport/HTTP failure — the
 * caller decides what to show instead (cache, or a small "unavailable" message); this never
 * invents a value.
 */
export async function fetchRouteWeather(
  plan: RouteWeatherPlan,
  signal?: AbortSignal,
): Promise<RouteWeatherReading[]> {
  if (plan.points.length === 0) return [];

  const etas = plan.points.map((p) => p.etaMs);
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", plan.points.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", plan.points.map((p) => p.lng.toFixed(4)).join(","));
  url.searchParams.set("hourly", "weathercode,temperature_2m,is_day");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("start_date", utcDay(Math.min(...etas)));
  // One hour past the latest ETA, same as the wind pilot: an ETA at 23:40 needs the 00:00 stamp
  // of the next day to have anything to be "nearest" to.
  url.searchParams.set("end_date", utcDay(Math.max(...etas) + HOUR_S * 1000));

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
  return readRouteWeatherResponse(await response.json(), plan.points);
}
