// The data behind the elevation profile drawn under a route map (app/ElevationProfile.tsx) —
// a cycling-style climb chart: cumulative distance along the route on X, metres above sea
// level on Y.
//
// Pure geometry, no DOM: the same split as app/track-thumbnail.ts, which lets this be unit
// tested in the repo's node-environment Vitest (there is deliberately no jsdom here).
//
// X IS REAL DISTANCE, NOT POINT INDEX. GPS points are not evenly spaced — a recorded ride
// samples far more densely when the rider is slow, which is exactly when they are climbing.
// Plotting against index would stretch every climb and squash every descent. Distance comes
// from geo.ts's cumulativeDistanceKm (haversine), the same helper the live map uses.
//
// Elevation runs as an array PARALLEL to the points rather than living on them, because the
// route point shape ([lat, lng] tuples) is a frozen API contract — see lib/event-route.ts.

import { cumulativeDistanceKm } from "./geo";

export interface ElevationSample {
  /** Cumulative distance from the route's first point, in kilometres. */
  distanceKm: number;
  /** Metres above sea level. Can be negative — the Dead Sea sits around -400 m. */
  elevationM: number;
}

export interface ElevationProfile {
  /** Route order, distance non-decreasing. Already reduced for drawing; see downsamplePeaks. */
  samples: ElevationSample[];
  /** Full route length, from every point — not just the ones that had elevation. */
  totalKm: number;
  minM: number;
  maxM: number;
}

/** Everest is 8 849 m. Anything past this is a corrupt tag, not a mountain. */
const MAX_PLAUSIBLE_ELEVATION_M = 9000;

/** Roughly two per horizontal pixel on a wide phone — past this the line cannot show more. */
const DEFAULT_MAX_SAMPLES = 240;

/**
 * Pairs a route's points with its elevation series.
 *
 * Returns null — never a half-drawn chart — whenever there is nothing honest to plot: no
 * elevation data, an all-null series, a series that does not line up with the points, a route
 * with fewer than two points, or a route with no length. The caller renders nothing and the
 * page carries on; a route without elevation is a normal route, not an error.
 *
 * A PARTIAL series is still drawn. Points whose elevation is missing or unparseable are
 * skipped, but distance is measured across the whole point list, so the line simply spans the
 * gap at its true width instead of pulling later kilometres backwards.
 */
export function buildElevationProfile(
  points: readonly [number, number][] | null | undefined,
  elevations: readonly (number | null | undefined)[] | null | undefined,
  maxSamples: number = DEFAULT_MAX_SAMPLES,
): ElevationProfile | null {
  if (!points || !elevations) return null;
  if (points.length < 2) return null;
  // A mismatched length means the two arrays are not describing the same route. Guessing which
  // point each elevation belongs to would draw a plausible-looking lie.
  if (points.length !== elevations.length) return null;
  // One bad coordinate poisons every cumulative distance after it (NaN propagates through the
  // running total), so the whole route is rejected rather than silently truncated.
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  }

  const cumulative = cumulativeDistanceKm(points);
  const totalKm = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalKm) || totalKm <= 0) return null;

  const samples: ElevationSample[] = [];
  for (let i = 0; i < points.length; i++) {
    const elevationM = elevations[i];
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) continue;
    if (Math.abs(elevationM) > MAX_PLAUSIBLE_ELEVATION_M) continue;
    samples.push({ distanceKm: cumulative[i], elevationM });
  }
  if (samples.length < 2) return null;

  const reduced = downsamplePeaks(samples, maxSamples);

  let minM = reduced[0].elevationM;
  let maxM = reduced[0].elevationM;
  for (const sample of reduced) {
    if (sample.elevationM < minM) minM = sample.elevationM;
    if (sample.elevationM > maxM) maxM = sample.elevationM;
  }

  return { samples: reduced, totalKm, minM, maxM };
}

/**
 * Reduces a long series to about `maxSamples` points WITHOUT flattening the route.
 *
 * Every Nth point is the obvious approach and the wrong one: the summit of a climb is a single
 * sample, and dropping it turns a real col into a gentle rise. This instead splits the series
 * into buckets and keeps each bucket's LOWEST and HIGHEST point, in route order, so every local
 * peak and valley survives — and the global maximum and minimum always do, since each is the
 * extreme of its own bucket. The route's first and last points are always kept, so the profile
 * still starts and ends where the ride does.
 */
function downsamplePeaks(
  samples: readonly ElevationSample[],
  maxSamples: number,
): ElevationSample[] {
  // Below four there is no room for a min and a max plus both ends.
  if (maxSamples < 4 || samples.length <= maxSamples) return samples.slice();

  const total = samples.length;
  const bucketCount = Math.floor(maxSamples / 2);
  const out: ElevationSample[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor((bucket * total) / bucketCount);
    const end = Math.floor(((bucket + 1) * total) / bucketCount);
    if (end <= start) continue;

    let lowest = start;
    let highest = start;
    for (let i = start + 1; i < end; i++) {
      if (samples[i].elevationM < samples[lowest].elevationM) lowest = i;
      if (samples[i].elevationM > samples[highest].elevationM) highest = i;
    }

    // Route order within the bucket, so distance stays non-decreasing across the whole series.
    const first = Math.min(lowest, highest);
    const second = Math.max(lowest, highest);
    out.push(samples[first]);
    if (second !== first) out.push(samples[second]);
  }

  if (out[0] !== samples[0]) out.unshift(samples[0]);
  if (out[out.length - 1] !== samples[total - 1]) out.push(samples[total - 1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Axes
//
// WHY THE Y AXIS DOES NOT START AT SEA LEVEL. Anchoring at 0 m is the honest-looking choice for
// a bar chart and the wrong one here: a ride that runs between 1 400 m and 1 600 m would be a
// flat sliver pinned to the top of the box, and the climbs the chart exists to show would be
// invisible. Every cycling profile — gpx.studio, Strava, a race roadbook — scales to the route's
// own range instead, and readers expect that.
//
// The exaggeration that convention invites is the opposite one: a route varying by three metres,
// stretched to fill the height, reads as an alpine stage. The guard is MIN_DOMAIN_SPAN_M — the
// domain never covers less than 100 m, so a flat route draws as a flat line. Between those two,
// the domain is the data's range snapped outwards to round numbers, so the gridlines land on
// values worth reading.
// ---------------------------------------------------------------------------------------------

/** A route flatter than this is drawn flat rather than amplified to fill the chart. */
const MIN_DOMAIN_SPAN_M = 100;

export interface ElevationAxis {
  /** Domain floor — where the filled area is anchored. Not necessarily 0, and can be negative. */
  minM: number;
  maxM: number;
  /** Gridline/label values, inside [minM, maxM]. */
  ticks: number[];
}

/** A round step near `raw`: 1, 2 or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const rounded = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return rounded * power;
}

/** Trims the float noise that accumulates when stepping by a fractional value. */
function snap(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(value.toFixed(Math.min(decimals, 6)));
}

/**
 * Round tick values covering [min, max], roughly `targetCount` of them. Never hard-codes a
 * scale: the same call serves a coastal ride and a 2 000 m mountain stage.
 */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  if (max === min) return [min];

  const count = Math.max(2, targetCount);
  const step = niceStep((max - min) / (count - 1));
  const ticks: number[] = [];
  // A tick landing a hair outside through float error would be dropped, hence the tolerance.
  const tolerance = step * 1e-6;
  for (let value = Math.ceil(min / step) * step; value <= max + tolerance; value += step) {
    ticks.push(snap(value, step));
  }
  return ticks;
}

/**
 * The Y domain and gridlines for a profile — see the note above for why it tracks the route's
 * own range instead of sea level, and how flat routes are kept flat.
 */
export function elevationAxis(profile: ElevationProfile, targetTicks = 3): ElevationAxis {
  let low = profile.minM;
  let high = profile.maxM;

  if (high - low < MIN_DOMAIN_SPAN_M) {
    const middle = (low + high) / 2;
    low = middle - MIN_DOMAIN_SPAN_M / 2;
    high = middle + MIN_DOMAIN_SPAN_M / 2;
  }

  // Snap outwards so the top and bottom of the chart are themselves round numbers.
  const step = niceStep((high - low) / Math.max(1, targetTicks));
  const minM = Math.floor(low / step) * step;
  const maxM = Math.ceil(high / step) * step;

  return { minM, maxM, ticks: niceTicks(minM, maxM, targetTicks + 1) };
}

/** Distance gridlines/labels: round kilometre marks across the route's length. */
export function distanceTicks(totalKm: number, targetTicks = 4): number[] {
  if (!Number.isFinite(totalKm) || totalKm <= 0) return [];
  return niceTicks(0, totalKm, targetTicks);
}
