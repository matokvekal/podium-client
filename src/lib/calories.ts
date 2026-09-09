/**
 * Calorie estimate for a ride — the maths behind the small utility row under the route map
 * (app/CalorieEstimator.tsx), kept here so it is testable on its own and so no component owns
 * a formula.
 *
 * The ride supplies distance and climb; the rider supplies weight and the average speed they
 * expect to hold. Nothing here is persisted server-side and nothing is sent anywhere: the two
 * rider inputs live in this device's localStorage (see the preferences section at the bottom)
 * so the same rider does not retype their weight on every ride.
 *
 * IT IS AN ESTIMATE. MET tables are population averages, and a group ride's real cost depends
 * on wind, drafting, surface and how hard the front is riding — none of which this knows. The
 * result is deliberately rounded to the nearest 5 kcal: printing "1,123" would claim a
 * precision this does not have, and the UI labels it "Estimated" for the same reason.
 */

import type { RiderLevel } from "./rider-level";

/** Slider bounds for the average-speed control — asked for directly. */
export const SPEED_MIN_KMH = 20;
export const SPEED_MAX_KMH = 34;
export const SPEED_STEP_KMH = 0.5;

/** Weight bounds. Wide enough for any adult rider, narrow enough that a fat-fingered "+" or a
 *  stale localStorage value can never produce a silly number. */
export const WEIGHT_MIN_KG = 40;
export const WEIGHT_MAX_KG = 120;
export const WEIGHT_STEP_KG = 1;
export const DEFAULT_WEIGHT_KG = 70;

/** Used when the organizer set no level: the middle of the slider, not a guess at the group. */
export const FALLBACK_SPEED_KMH = 27;

/**
 * The average speed each ride level starts the slider at. The five levels are the app's own
 * (lib/rider-level.ts) — nothing new is invented here, this only says how fast each one
 * typically rolls, and the rider can move the slider the moment they disagree.
 */
export const DEFAULT_SPEED_BY_LEVEL: Record<RiderLevel, number> = {
  beginner: 22,
  intermediate: 25,
  masters: 28,
  elite: 31,
  world_tour: 34,
};

export function defaultSpeedForLevel(level: RiderLevel | null | undefined): number {
  return level ? DEFAULT_SPEED_BY_LEVEL[level] : FALLBACK_SPEED_KMH;
}

/**
 * Which of the five effort colours (tokens.css `--energy-1…5`) this speed deserves — cool at
 * the bottom of the slider, hot at the top. Asked for directly: pushing the slider up should
 * FEEL like more effort, not just read as a bigger number, so the bar, its thumb and the flame
 * all heat up together.
 *
 * Five buckets rather than a continuous ramp: crossing into a new colour is a small event, and
 * a smooth blend over 29 slider positions would just look like a slowly changing blue.
 */
const ENERGY_THRESHOLDS = [23, 26, 29, 32];

export function energyLevel(speedKmh: number): 1 | 2 | 3 | 4 | 5 {
  const speed = clampSpeed(speedKmh);
  let level = 1;
  for (const threshold of ENERGY_THRESHOLDS) {
    if (speed >= threshold) level += 1;
  }
  return level as 1 | 2 | 3 | 4 | 5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampWeight(kg: number): number {
  if (!Number.isFinite(kg)) return DEFAULT_WEIGHT_KG;
  return clamp(Math.round(kg), WEIGHT_MIN_KG, WEIGHT_MAX_KG);
}

/** Clamped AND snapped to the slider's 0.5 step, so a stored or typed 28.37 cannot produce a
 *  value the slider itself could never reach. */
export function clampSpeed(kmh: number): number {
  if (!Number.isFinite(kmh)) return FALLBACK_SPEED_KMH;
  const snapped = Math.round(kmh / SPEED_STEP_KMH) * SPEED_STEP_KMH;
  return clamp(snapped, SPEED_MIN_KMH, SPEED_MAX_KMH);
}

/**
 * MET (metabolic equivalent) for cycling at a given speed.
 *
 * The Compendium of Physical Activities gives cycling as speed BRACKETS (under 16 km/h = 4.0,
 * 16–19.2 = 6.8, 19.3–22.4 = 8.0, 22.5–25.6 = 10.0, 25.7–30.6 = 12.0, over 32.2 = 15.8). Read
 * as brackets the estimate would jump by a couple of hundred kcal as the slider crosses a
 * boundary, which looks like a bug and implies a precision that isn't there — so each bracket
 * is pinned at its midpoint and the curve interpolated between those anchors. Flat outside the
 * ends.
 */
const MET_ANCHORS: readonly (readonly [speedKmh: number, met: number])[] = [
  [14, 4.0],
  [17.6, 6.8],
  [20.8, 8.0],
  [24.0, 10.0],
  [28.2, 12.0],
  [34.0, 15.8],
];

export function metForSpeed(kmh: number): number {
  const first = MET_ANCHORS[0];
  const last = MET_ANCHORS[MET_ANCHORS.length - 1];
  if (!Number.isFinite(kmh) || kmh <= first[0]) return first[1];
  if (kmh >= last[0]) return last[1];
  for (let i = 1; i < MET_ANCHORS.length; i++) {
    const [hiSpeed, hiMet] = MET_ANCHORS[i];
    if (kmh > hiSpeed) continue;
    const [loSpeed, loMet] = MET_ANCHORS[i - 1];
    const t = (kmh - loSpeed) / (hiSpeed - loSpeed);
    return loMet + t * (hiMet - loMet);
  }
  return last[1];
}

/** Metres of climb per km at which the climb bonus stops growing, and the bonus at that point.
 *  25 m/km is a genuinely hilly ride; +15% is deliberately conservative — the climbing itself
 *  costs more than that, but the descent that follows costs almost nothing, and over a whole
 *  ride the two partly cancel. */
const MAX_CLIMB_PER_KM = 25;
const MAX_CLIMB_BONUS = 0.15;

/** How much harder the climbing makes this ride, as a multiplier of 1 or more. */
export function climbFactor(distanceKm: number, climbM: number | null | undefined): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
  const climb = climbM == null || !Number.isFinite(climbM) ? 0 : climbM;
  const perKm = clamp(climb / distanceKm, 0, MAX_CLIMB_PER_KM);
  return 1 + (MAX_CLIMB_BONUS / MAX_CLIMB_PER_KM) * perKm;
}

export interface CalorieInput {
  distanceKm: number | null | undefined;
  climbM: number | null | undefined;
  weightKg: number;
  speedKmh: number;
}

/**
 * Estimated kcal for the whole ride, rounded to the nearest 5.
 *
 * `null` — not 0 — when there is no usable distance, so the caller has exactly one thing to
 * check before deciding whether to render at all. A missing climb counts as flat.
 */
export function estimateCalories({
  distanceKm,
  climbM,
  weightKg,
  speedKmh,
}: CalorieInput): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const speed = clampSpeed(speedKmh);
  const weight = clampWeight(weightKg);
  const hours = distanceKm / speed;
  const kcal = weight * hours * metForSpeed(speed) * climbFactor(distanceKm, climbM);
  return Math.round(kcal / 5) * 5;
}

/** "1,120" — grouped, so a four-digit burn is readable at a glance. */
export function formatKcal(kcal: number): string {
  return kcal.toLocaleString("en-US");
}

/** "30.5" / "28" — the slider's own half-km granularity, no trailing ".0". */
export function formatSpeed(kmh: number): string {
  return Number.isInteger(kmh) ? String(kmh) : kmh.toFixed(1);
}

// --- preferences (this device only) ------------------------------------------------------
//
// Weight and speed are properties of the RIDER, not of the ride, so they are remembered across
// rides. localStorage, same shape as lib/color-theme.ts: no server column exists for either and
// none should — this is a calculator setting, not profile data.
//
// Every access is wrapped: Safari private mode, a full quota and a locked-down browser all
// throw on a plain localStorage call, and none of that may take the ride page down with it.
// When storage is unavailable the estimator simply starts from the defaults each visit.

export const WEIGHT_STORAGE_KEY = "elnino.calorieEstimator.weightKg";
export const SPEED_STORAGE_KEY = "elnino.calorieEstimator.averageSpeedKmh";

/** A stored number, or null if it is missing, unparseable or outside what the control allows.
 *  Out-of-range values are REJECTED rather than clamped: a stored "500" is corrupt, and
 *  silently turning it into 120 kg would present a garbage number as the rider's own choice. */
function readStored(key: string, min: number, max: number): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return value;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage full or blocked — the estimator keeps working for this page session.
  }
}

export function readStoredWeight(): number | null {
  const stored = readStored(WEIGHT_STORAGE_KEY, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  return stored === null ? null : clampWeight(stored);
}

export function readStoredSpeed(): number | null {
  const stored = readStored(SPEED_STORAGE_KEY, SPEED_MIN_KMH, SPEED_MAX_KMH);
  return stored === null ? null : clampSpeed(stored);
}

export function storeWeight(kg: number): void {
  writeStored(WEIGHT_STORAGE_KEY, kg);
}

export function storeSpeed(kmh: number): void {
  writeStored(SPEED_STORAGE_KEY, kmh);
}
