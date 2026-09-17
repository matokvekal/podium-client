// Ride duration — the organizer's estimate of how long the ride takes, entered on the create
// form and shown in the card / detail "Est. Time" slot (which read a hard-coded "soon" until
// this existed). Stored server-side as whole minutes in events.duration_min
// (sql/022-event-ride-plan.sql); this module is only the format/split layer the form and the
// read views share so they agree on what 165 minutes means.
//
// The organizer's own figure is the authority and always wins.
//
// ⚠ THIS FILE USED TO SAY A TIME IS NEVER DERIVED FROM DISTANCE, on the grounds that it needs
//   an assumed speed and this app does not ship invented numbers. That rule was reversed
//   deliberately, because the alternative turned out to be worse: organizers skip the field, so
//   most cards read "soon", and a rider comparing two rides got nothing at all. An estimate the
//   app OWNS UP TO is more use than a blank.
//
//   The reversal is narrow, and these three conditions are what keep it honest:
//     1. the organizer's value is never replaced or adjusted — the estimate only fills a blank;
//     2. it is always rendered with a "~" and labelled as an estimate (formatEstimatedDuration),
//        never as though a person had stated it;
//     3. it is derived only from what the organizer DID state — distance, climb, discipline,
//        terrain grade, level, rest stops — and returns null rather than guessing when the one
//        thing it cannot do without, distance, is missing.
//
// This is a DURATION, not a start time. The two are separate fields and must not be conflated:
// startsAt is when the group rolls out, durationMin is how long they expect to be out.
//
// The field used to be free text ("1", "1.5", "2:45") parsed with a small grammar, plus four
// preset chips. It is now two dropdowns — see EventCreatePage — so there is nothing left to
// parse and no way to type something unreadable. The parser and the presets went with it.

import { type RiderLevel, RUNNING_PACE_MIN_PER_KM } from "./rider-level";
import type { SurfaceType } from "./surface-types";
import type { TerrainGrade } from "./terrain-grade";

/** Upper bound mirrors the server schema (durationMin ≤ 2880 = 48h). */
export const MAX_DURATION_MIN = 2880;

/**
 * Hour values offered by the picker: 0…48, so the control can express exactly the range the
 * server accepts and no more. Long enough for a multi-day audax, and a native <select> on a
 * phone renders it as a scroll wheel, so length costs nothing.
 */
export const DURATION_HOUR_OPTIONS: readonly number[] = Array.from({ length: 49 }, (_, i) => i);

/**
 * Minute values offered by the picker. Five-minute steps: an estimate finer than that is
 * false precision, and twelve wheel rows are far quicker to land on than sixty.
 */
export const DURATION_MINUTE_OPTIONS: readonly number[] = Array.from(
  { length: 12 },
  (_, i) => i * 5,
);

/**
 * Ride-time ranges for the "Browse tracks" filter. A range picker, not a free number: an
 * organizer's estimate is coarse, so "2–3h" is the honest granularity. Half-open — `[minMin,
 * maxMin)` — so the buckets tile without overlap. Keys match the server's DURATION_BUCKET_KEYS
 * (event.schemas.ts) and its OR-group over events.duration_min.
 */
export type DurationBucketKey = "lt1" | "1to2" | "2to3" | "3to5" | "gt5";

export const DURATION_BUCKETS: {
  key: DurationBucketKey;
  label: string;
  minMin?: number;
  maxMin?: number;
}[] = [
  { key: "lt1", label: "< 1h", maxMin: 60 },
  { key: "1to2", label: "1–2h", minMin: 60, maxMin: 120 },
  { key: "2to3", label: "2–3h", minMin: 120, maxMin: 180 },
  { key: "3to5", label: "3–5h", minMin: 180, maxMin: 300 },
  { key: "gt5", label: "5h+", minMin: 300 },
];

/**
 * Does a stored ride time fall in ANY of the selected buckets? Empty selection = no filter
 * (everything passes). A ride with no stated duration never matches a bucket — you cannot say
 * a blank is "under an hour" — which mirrors the server's `duration_min IS NOT NULL` guard.
 */
export function matchesDurationBuckets(
  minutes: number | null | undefined,
  keys: DurationBucketKey[],
): boolean {
  if (keys.length === 0) return true;
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return false;
  return keys.some((key) => {
    const bucket = DURATION_BUCKETS.find((b) => b.key === key);
    if (!bucket) return false;
    if (bucket.minMin != null && minutes < bucket.minMin) return false;
    if (bucket.maxMin != null && minutes >= bucket.maxMin) return false;
    return true;
  });
}

/** "2h 45m" / "2h" / "45m". Empty string for null / non-positive — callers render a dash. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Split a stored minute count into the two values the picker's dropdowns show.
 *
 * `null` in, `null` out for both: "not stated" is a real state for this field and must survive
 * a round trip through the form untouched. It is NOT the same as zero.
 */
export function splitDuration(minutes: number | null | undefined): {
  hours: number | null;
  mins: number | null;
} {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return { hours: null, mins: null };
  }
  const clamped = Math.min(Math.round(minutes), MAX_DURATION_MIN);
  return { hours: Math.floor(clamped / 60), mins: clamped % 60 };
}

/**
 * Combine the two dropdown values back into whole minutes for the server.
 *
 * Both unset, or a total of zero, means "not stated" and sends `null` — the server column is
 * nullable and the read views render a dash. The total is clamped to the server's own bound so
 * a 48h + 55m selection cannot produce a body the API would reject.
 */
export function joinDuration(hours: number | null, mins: number | null): number | null {
  if (hours == null && mins == null) return null;
  const total = (hours ?? 0) * 60 + (mins ?? 0);
  if (total <= 0) return null;
  return Math.min(total, MAX_DURATION_MIN);
}

// ---------------------------------------------------------------------------------------
// The estimate — used ONLY when the organizer left the field blank
// ---------------------------------------------------------------------------------------

/**
 * Minutes added per rest/regroup stop.
 *
 * A coffee stop is rarely under ten minutes once a group of fifteen has queued, and rest stops
 * are the single biggest reason a ride's elapsed time beats its moving time. The organizer
 * already tells us how many there are (events.rest_stops, sql/022), so this is stated data
 * rather than another assumption.
 */
const REST_STOP_MIN = 12;

/**
 * Riding speed on the flat, km/h, by discipline and terrain.
 *
 * These are GROUP speeds for a social ride, not what a strong solo rider holds — the number
 * has to predict when the last person rolls back in, which is what somebody reading the card
 * is actually planning around.
 *
 * The off-road rows are indexed by terrain grade (lib/terrain-grade.ts): technical ground costs
 * far more time than distance suggests, which is the whole reason the grade is worth collecting.
 * `null` is the "grade not stated" column, set to roughly the middle of each scale.
 */
const FLAT_SPEED_KMH: Record<SurfaceType, Record<TerrainGrade | "unstated", number>> = {
  road: { 1: 24, 2: 23, 3: 22, 4: 20, 5: 18, unstated: 22 },
  gravel: { 1: 20, 2: 18, 3: 16, 4: 13, 5: 11, unstated: 17 },
  mtb: { 1: 15, 2: 13, 3: 11, 4: 8, 5: 6, unstated: 12 },
  // Running/hiking speed comes from pace and Naismith respectively; these keep the record total
  // and are the fallback when no level is set.
  running: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, unstated: 9 },
  hiking: { 1: 4.5, 2: 4.5, 3: 4.5, 4: 4.5, 5: 4.5, unstated: 4.5 },
};

/** Discipline with nothing stated at all — a bike ride on mixed ground. */
const DEFAULT_FLAT_SPEED_KMH = 20;

/**
 * Climb rate, metres per hour, by discipline. Time for the ascent is added on top of the flat
 * time — the standard way both cycling and Naismith's rule handle elevation, and much closer
 * than pretending a 1,200 m day rides like a flat one.
 *
 * Hiking is 600 m/h because that is literally Naismith ("add one hour per 600 m of ascent").
 */
const CLIMB_RATE_M_PER_H: Record<SurfaceType, number> = {
  road: 600,
  gravel: 500,
  mtb: 420,
  running: 400,
  hiking: 600,
};

const DEFAULT_CLIMB_RATE_M_PER_H = 550;

/**
 * Speed multiplier for who the ride is pitched at (lib/rider-level.ts).
 *
 * Deliberately gentle — a level is a rough label, not a power figure, and the terrain grade
 * above already carries most of the signal. It exists because the difference between a
 * beginners' social spin and a World Tour group over the same 80 km is more than an hour, and
 * ignoring a field the organizer filled in would be the bigger error.
 *
 * Not used for running, where `level` IS the pace and is read directly instead.
 */
const LEVEL_SPEED_FACTOR: Record<RiderLevel, number> = {
  beginner: 0.85,
  intermediate: 1,
  masters: 1.08,
  elite: 1.18,
  world_tour: 1.32,
};

/** What the estimate is allowed to read. Everything is optional; everything absent is honest. */
export interface DurationEstimateInput {
  distanceKm: number | null | undefined;
  climbM: number | null | undefined;
  activityType: SurfaceType | null | undefined;
  terrainGrade: TerrainGrade | null | undefined;
  level: RiderLevel | null | undefined;
  restStops: number | null | undefined;
}

/**
 * How long this ride probably takes, in whole minutes — or `null` when it cannot be said.
 *
 * ⚠ CALL THIS ONLY WHEN `durationMin` IS BLANK. The organizer's own figure is the authority and
 * must never be replaced, adjusted or averaged with this one.
 *
 * Returns null without a distance: that is the one input there is no honest substitute for, and
 * a card then keeps showing "soon" exactly as it does today. A missing climb is treated as flat
 * rather than refused — plenty of real rides are, and a route with no elevation series is
 * common (see EventRoute.elevations).
 *
 * The result is rounded to five minutes. Anything finer is false precision on a figure built
 * from group speeds, and "~2h 47m" reads like a promise in a way "~2h 45m" does not.
 */
export function estimateDurationMin(input: DurationEstimateInput): number | null {
  const { distanceKm, climbM, activityType, terrainGrade, level, restStops } = input;
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const gradeKey: TerrainGrade | "unstated" = terrainGrade ?? "unstated";
  let flatSpeed = activityType ? FLAT_SPEED_KMH[activityType][gradeKey] : DEFAULT_FLAT_SPEED_KMH;

  if (activityType === "running" && level) {
    // `level` is the pace itself for a run, so use it rather than a multiplier on a guess.
    flatSpeed = 60 / RUNNING_PACE_MIN_PER_KM[level];
  } else if (level) {
    flatSpeed *= LEVEL_SPEED_FACTOR[level];
  }

  const climbRate = activityType ? CLIMB_RATE_M_PER_H[activityType] : DEFAULT_CLIMB_RATE_M_PER_H;
  const climb = climbM != null && Number.isFinite(climbM) && climbM > 0 ? climbM : 0;

  const movingMin = (distanceKm / flatSpeed) * 60 + (climb / climbRate) * 60;
  const stops = restStops != null && Number.isFinite(restStops) && restStops > 0 ? restStops : 0;
  const total = movingMin + stops * REST_STOP_MIN;

  // At least five minutes, so a 200 m car-park loop never estimates zero.
  const rounded = Math.max(5, Math.round(total / 5) * 5);
  return Math.min(rounded, MAX_DURATION_MIN);
}

/**
 * "~2h 45m" — the estimate, marked as one.
 *
 * The tilde is not decoration: it is the whole difference between a figure a person stated and
 * a figure the app worked out. Every surface that shows an estimate must go through this, so a
 * rider never has to wonder which kind of number they are reading.
 */
export function formatEstimatedDuration(minutes: number | null | undefined): string {
  const text = formatDuration(minutes);
  return text ? `~${text}` : "";
}
