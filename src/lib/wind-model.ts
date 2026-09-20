// Wind around a ride — the pure part: which hours to show, where to ask, and how strong is strong.
//
// PILOT (see lib/wind-eligibility.ts for who gets it). No DOM, no network, no storage here, so
// all of it is unit-tested in the repo's node-environment Vitest.
//
// THIS IS A WEATHER FORECAST FOR THE RIDE WINDOW, NOT A PREDICTION OF THE RIDER. We do not know
// where anyone will be at a given minute — they start early or late, ride fast or slow, stop for
// coffee — so nothing here estimates a position, an ETA or a heading, and nothing says "headwind".
// The question answered is only: what is the wind doing in the hours around this ride?

import { cumulativeDistanceKm } from "./geo";

// ---------------------------------------------------------------------------------------------
// Configuration — every number a future tuning pass might touch lives in this block.
// ---------------------------------------------------------------------------------------------

/** The window opens this long before the planned start and closes this long after the planned end. */
export const WIND_WINDOW_PADDING_MS = 60 * 60 * 1000;

/** One column per hour, counted from the window's opening — so a 06:30 start gives 05:30, 06:30… */
export const WIND_STEP_MS = 60 * 60 * 1000;

/**
 * Absolute wind strength → colour band, on the SUSTAINED 10 m wind speed in km/h.
 * Each band is `speed < maxKmh` (exclusive), so 12.0 is already "moderate". The edges follow how
 * wind feels on a bike rather than the Beaufort names:
 *   < 12   light        barely noticed; below a gentle breeze
 *   12–20  moderate     noticeable, you work a little harder into it
 *   20–30  strong       a headwind now costs real speed; crosswinds start to push you around
 *   ≥ 30   very strong  hard riding, and gusts on top become a handling issue
 * Colour is strength only — it says nothing about whether the wind helps or hurts.
 */
export const WIND_STRENGTH_BANDS = [
  { level: "light", maxKmh: 12 },
  { level: "moderate", maxKmh: 20 },
  { level: "strong", maxKmh: 30 },
  { level: "veryStrong", maxKmh: Number.POSITIVE_INFINITY },
] as const;

export type WindStrength = (typeof WIND_STRENGTH_BANDS)[number]["level"];

/** Gusts are printed only when they exceed the sustained speed by at least this much. */
export const GUST_MARGIN_KMH = 6;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** One forecast hour — what is cached and drawn. */
export interface WindSample {
  timeMs: number;
  speedKmh: number;
  /** Where the wind blows FROM, degrees clockwise from north (the meteorological convention). */
  directionDeg: number;
  gustKmh: number | null;
  /** Air temperature at 2 m, °C — one plain row under the wind, never coloured. Null if absent. */
  temperatureC: number | null;
}

export function windStrength(speedKmh: number): WindStrength {
  for (const band of WIND_STRENGTH_BANDS) {
    if (speedKmh < band.maxKmh) return band.level;
  }
  return "veryStrong";
}

/**
 * The colour scale for a data cell: a CONTINUOUS ramp over km/h rather than four flat fills, so 6
 * and 14 and 22 and 34 all look different at a glance (a flat "light = green" made every calm hour
 * the same pale patch). The four named bands above are still the vocabulary — light is the cool
 * blue→green end, moderate green→yellow, strong yellow→orange, very strong red→purple — the ramp
 * just moves smoothly through them, and each band's edge (12 / 20 / 30) lands on its own hue.
 *
 * Stops are [km/h, hex]; between stops the colour is interpolated linearly in RGB, above the last
 * stop it stays at the last colour. Colour is strength only.
 */
export const WIND_COLOR_STOPS: readonly (readonly [number, string])[] = [
  [0, "#cfe9f6"], // near-calm: pale blue
  [6, "#9fdcd0"], // aqua
  [12, "#7ed08a"], // green — top of "light"
  [16, "#d3e35c"], // yellow-green
  [20, "#f7d444"], // yellow — top of "moderate"
  [25, "#f6a03d"], // orange
  [30, "#ef5a3a"], // red-orange — top of "strong"
  [40, "#c9294d"], // crimson
  [50, "#8b2a8c"], // purple: a gale
];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG), 0 = black … 1 = white. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Background and text colour for a wind value in km/h. The text flips to white once the fill is
 * dark enough (the crimson/purple end) so the number stays readable across the whole ramp.
 */
export function windCellColors(speedKmh: number): { background: string; color: string } {
  const stops = WIND_COLOR_STOPS;
  const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;

  let rgb: [number, number, number];
  if (v >= stops[stops.length - 1][0]) {
    rgb = hexToRgb(stops[stops.length - 1][1]);
  } else {
    let i = 0;
    while (v >= stops[i + 1][0]) i++;
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    const t = (v - v0) / (v1 - v0);
    const a = hexToRgb(c0);
    const b = hexToRgb(c1);
    rgb = [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
  }

  const background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  return { background, color: luminance(rgb) < 0.32 ? "#ffffff" : "#14243c" };
}

/** Whether the gust is worth printing next to the sustained speed. */
export function showGust(speedKmh: number, gustKmh: number | null): gustKmh is number {
  return gustKmh != null && gustKmh - speedKmh >= GUST_MARGIN_KMH;
}

// ---------------------------------------------------------------------------------------------
// Where to ask
// ---------------------------------------------------------------------------------------------

/**
 * The one place the forecast is asked about: the point HALFWAY ALONG the route by distance.
 *
 * Not the start (a point-to-point ride can end 40 km away), and not the bounding-box centre (on a
 * loop or an out-and-back that can fall off the route, in another valley). The midpoint by
 * distance is always on the track, is within half a route of everywhere the ride goes, and needs
 * one coordinate — Open-Meteo's grid is ~11 km, so a finer model would only imply precision the
 * data does not have.
 */
export function representativePoint(
  points: readonly [number, number][] | null | undefined,
): { lat: number; lng: number; totalKm: number } | null {
  if (!points || points.length < 2) return null;
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  }
  const cumulative = cumulativeDistanceKm(points);
  const totalKm = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const half = totalKm / 2;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] <= half) low = mid;
    else high = mid;
  }
  const span = cumulative[high] - cumulative[low];
  const t = span > 0 ? (half - cumulative[low]) / span : 0;
  return {
    lat: points[low][0] + (points[high][0] - points[low][0]) * t,
    lng: points[low][1] + (points[high][1] - points[low][1]) * t,
    totalKm,
  };
}

// ---------------------------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------------------------

export interface WindPlan {
  lat: number;
  lng: number;
  /** Hourly instants, epoch ms: planned start − 1 h … planned end + 1 h, and never beyond. */
  timesMs: number[];
  /**
   * Identifies the ride this plan was made for: start, duration and the place asked about. The
   * cache stores it beside the forecast, so a ride whose date, length or route was edited never
   * shows the old ride's wind.
   */
  signature: string;
}

export interface PlanInput {
  points: readonly [number, number][] | null | undefined;
  /** Planned start instant, epoch ms. */
  startMs: number;
  /** Planned duration in minutes — the organizer's figure, or the app's estimate. */
  durationMin: number;
}

/**
 * The hours to show. Ride 06:30–10:30 → 05:30, 06:30, 07:30 … 11:30.
 *
 * The window is exactly [start − 1 h, end + 1 h]; the steps are hourly from its opening. If the
 * span is not a whole number of hours the last column is the last whole step inside it — the
 * window is never stretched to make the arithmetic tidy.
 *
 * Null when there is nothing honest to plan: no usable route, start or duration.
 */
export function planWindWindow({ points, startMs, durationMin }: PlanInput): WindPlan | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMin) || durationMin <= 0) return null;
  const where = representativePoint(points);
  if (!where) return null;

  const openMs = startMs - WIND_WINDOW_PADDING_MS;
  const closeMs = startMs + durationMin * 60_000 + WIND_WINDOW_PADDING_MS;

  const timesMs: number[] = [];
  for (let t = openMs; t <= closeMs; t += WIND_STEP_MS) timesMs.push(t);

  const signature = [
    startMs,
    Math.round(durationMin),
    where.lat.toFixed(3),
    where.lng.toFixed(3),
  ].join("|");
  return { lat: where.lat, lng: where.lng, timesMs, signature };
}
