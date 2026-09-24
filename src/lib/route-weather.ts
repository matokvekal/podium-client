// Route weather — the pure part: which points along a long ride to check, and when the rider
// is expected to reach each one. No DOM, no network, no storage here.
//
// This is deliberately SEPARATE from wind-model.ts's single representative point (used by the
// hourly wind strip). That model exists to answer "what is the wind doing around this ride" at
// one place; this one exists for the opposite reason — a long road ride can see genuinely
// different weather between its start and its far end, and a single point hides that. The two
// features do not share a cache, a plan shape or a UI, by design (asked for directly).
//
// Kept intentionally simple: a handful of points spaced by distance, each given a proportional
// ETA (start time + that fraction of the ride's expected duration). No speed model, no pacing,
// no rider position — the ETA is exactly as approximate as the organizer's own duration figure.

import { cumulativeDistanceKm, haversineDistanceKm } from "./geo";

/** A loop's start and finish are the same point for this purpose once they're this close —
 * far tighter than Open-Meteo's ~11 km grid, so this only catches genuine loops. */
const LOOP_MERGE_KM = 3;

export interface RouteWeatherPoint {
  /** "Start" / "Finish" / "Km 50". */
  label: string;
  lat: number;
  lng: number;
  /** Estimated arrival at this point, epoch ms. */
  etaMs: number;
}

export interface RouteWeatherPlan {
  points: RouteWeatherPoint[];
  /** Identifies the ride this plan was made for — start, duration and every sampled place, so
   * a ride whose date, length or route changed never shows the old plan's cached weather. */
  signature: string;
}

export interface RouteWeatherPlanInput {
  points: readonly [number, number][] | null | undefined;
  /** Planned start instant, epoch ms. */
  startMs: number;
  /** Minutes: the organizer's figure, or the app's estimate. */
  durationMin: number;
}

/** How many points to sample, by total route distance. Capped at 5 — this is meant to be
 * glanceable, not a full weather-along-the-route model. */
function sampleFractions(totalKm: number): number[] {
  if (totalKm <= 60) return [];
  if (totalKm <= 120) return [0, 0.5, 1];
  return [0, 0.25, 0.5, 0.75, 1];
}

function pointAtFraction(
  points: readonly [number, number][],
  cumulative: readonly number[],
  totalKm: number,
  fraction: number,
): [number, number] {
  const targetKm = totalKm * fraction;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] <= targetKm) low = mid;
    else high = mid;
  }
  const span = cumulative[high] - cumulative[low];
  const t = span > 0 ? (targetKm - cumulative[low]) / span : 0;
  return [
    points[low][0] + (points[high][0] - points[low][0]) * t,
    points[low][1] + (points[high][1] - points[low][1]) * t,
  ];
}

function labelFor(fraction: number, totalKm: number): string {
  if (fraction === 0) return "Start";
  if (fraction === 1) return "Finish";
  return `Km ${Math.round(totalKm * fraction)}`;
}

/**
 * The route-weather plan: a handful of points along the route with an ETA each, or `null` when
 * there's nothing honest to plan (no usable route/start/duration) or the route is short enough
 * that one point already covers it (see wind-model.ts's own single-point strip for that case).
 */
export function planRouteWeather({
  points,
  startMs,
  durationMin,
}: RouteWeatherPlanInput): RouteWeatherPlan | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMin) || durationMin <= 0) return null;
  if (!points || points.length < 2) return null;
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  }

  const cumulative = cumulativeDistanceKm(points);
  const totalKm = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const fractions = sampleFractions(totalKm);
  if (fractions.length === 0) return null;

  const isLoop = haversineDistanceKm(points[0], points[points.length - 1]) < LOOP_MERGE_KM;
  const effectiveFractions = isLoop ? fractions.filter((f) => f !== 1) : fractions;

  const planPoints: RouteWeatherPoint[] = effectiveFractions.map((fraction) => {
    const [lat, lng] = pointAtFraction(points, cumulative, totalKm, fraction);
    return {
      label: labelFor(fraction, totalKm),
      lat,
      lng,
      etaMs: startMs + fraction * durationMin * 60_000,
    };
  });

  const signature = [
    startMs,
    Math.round(durationMin),
    ...planPoints.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`),
  ].join("|");

  return { points: planPoints, signature };
}
