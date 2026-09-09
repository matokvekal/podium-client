/**
 * The calorie row under the route map on the ride page — asked for directly, to a supplied
 * reference (Images/calories.png).
 *
 * One low utility bar, not a dashboard: the ride already knows its distance and climb, so the
 * rider only supplies the two things the ride cannot know — their weight and the average speed
 * they expect to hold — and the burn updates as they touch either. No submit, no sheet, no
 * navigation.
 *
 *   [ 70 kg − + ]  |  [ 20 ──●─── 34   28 km/h ]  |  🔥 1,190 kcal / Estimated
 *
 * Distance and climb are NOT repeated here; they are already in the stat strip at the top of
 * the same page.
 *
 * It renders nothing at all when there is no usable distance, and nothing on a running or
 * hiking ride: a 20–34 km/h slider and a cycling MET curve say nothing true about a run.
 *
 * The number is an estimate and says so. All of the maths, the clamps and the two localStorage
 * preferences live in lib/calories.ts.
 */

import { Flame, Gauge, Minus, Plus, User } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import {
  clampSpeed,
  clampWeight,
  DEFAULT_WEIGHT_KG,
  defaultSpeedForLevel,
  energyLevel,
  estimateCalories,
  formatKcal,
  formatSpeed,
  readStoredSpeed,
  readStoredWeight,
  SPEED_MAX_KMH,
  SPEED_MIN_KMH,
  SPEED_STEP_KMH,
  storeSpeed,
  storeWeight,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  WEIGHT_STEP_KG,
} from "../lib/calories";
import type { RiderLevel } from "../lib/rider-level";
import type { SurfaceType } from "../lib/surface-types";
import styles from "./CalorieEstimator.module.css";

interface CalorieEstimatorProps {
  /** The ride's distance. The row does not render without one. */
  distanceKm: number | null;
  /** Total climb. Missing counts as flat. */
  climbM: number | null;
  /** Sets the slider's starting speed, unless this device has a saved one. */
  level: RiderLevel | null;
  activityType: SurfaceType | null;
}

/** Cycling only — the speeds and the MET curve are a bike's. */
const RIDDEN: SurfaceType[] = ["road", "gravel", "mtb"];

export function CalorieEstimator({
  distanceKm,
  climbM,
  level,
  activityType,
}: CalorieEstimatorProps) {
  // Saved rider preference first (it is the rider's own number, and it outranks any default),
  // then this ride's level, then the neutral fallbacks. Read once, at mount.
  const [weightKg, setWeightKg] = useState(() => readStoredWeight() ?? DEFAULT_WEIGHT_KG);
  const [speedKmh, setSpeedKmh] = useState(() => readStoredSpeed() ?? defaultSpeedForLevel(level));

  const kcal = useMemo(
    () => estimateCalories({ distanceKm, climbM, weightKg, speedKmh }),
    [distanceKm, climbM, weightKg, speedKmh],
  );

  if (kcal == null) return null;
  if (activityType != null && !RIDDEN.includes(activityType)) return null;

  // Written on change rather than in an effect, so simply opening a ride never writes anything
  // — only the rider actually moving a control does.
  const changeWeight = (next: number) => {
    const value = clampWeight(next);
    setWeightKg(value);
    storeWeight(value);
  };
  const changeSpeed = (next: number) => {
    const value = clampSpeed(next);
    setSpeedKmh(value);
    storeSpeed(value);
  };

  const fillPct = ((speedKmh - SPEED_MIN_KMH) / (SPEED_MAX_KMH - SPEED_MIN_KMH)) * 100;

  return (
    // data-energy walks the slider through the five effort colours — see lib/calories.ts and
    // the --energy-* tokens. It only ever drives GRAPHICS (bar, thumb, flame); the numbers stay
    // on --text, because an amber or magenta figure on white is a contrast problem, not a
    // reward.
    <div className={styles.row} data-energy={energyLevel(speedKmh)}>
      <div className={styles.group}>
        <User className={styles.groupIcon} aria-hidden="true" />
        <button
          type="button"
          className={styles.step}
          onClick={() => changeWeight(weightKg - WEIGHT_STEP_KG)}
          disabled={weightKg <= WEIGHT_MIN_KG}
          aria-label="Lower the weight by one kilo"
        >
          <Minus width={16} height={16} aria-hidden="true" />
        </button>
        <span className={styles.weight}>
          {weightKg}
          <span className={styles.unit}>kg</span>
        </span>
        <button
          type="button"
          className={styles.step}
          onClick={() => changeWeight(weightKg + WEIGHT_STEP_KG)}
          disabled={weightKg >= WEIGHT_MAX_KG}
          aria-label="Raise the weight by one kilo"
        >
          <Plus width={16} height={16} aria-hidden="true" />
        </button>
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.group} data-grow="true">
        <Gauge className={styles.groupIcon} aria-hidden="true" />
        <span className={styles.bound} aria-hidden="true">
          {SPEED_MIN_KMH}
        </span>
        {/* Single-handle, so the whole control is interactive and tapping the track jumps to
            that speed. app/RangeSlider.tsx is the two-handle filter slider and cannot be
            reused here; only its thumb styling is shared, by copy. */}
        <span className={styles.track} style={{ "--fill": `${fillPct}%` } as CSSProperties}>
          <span className={styles.trackBg} />
          <span className={styles.trackFill} />
          <input
            type="range"
            className={styles.range}
            min={SPEED_MIN_KMH}
            max={SPEED_MAX_KMH}
            step={SPEED_STEP_KMH}
            value={speedKmh}
            onChange={(e) => changeSpeed(Number(e.target.value))}
            aria-label="Average speed"
            aria-valuetext={`${formatSpeed(speedKmh)} km/h`}
          />
        </span>
        <span className={styles.bound} aria-hidden="true">
          {SPEED_MAX_KMH}
        </span>
        <span className={styles.speed}>
          {formatSpeed(speedKmh)}
          <span className={styles.unit}>km/h</span>
        </span>
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.result}>
        <span className={styles.kcalRow}>
          <Flame className={styles.flame} aria-hidden="true" />
          <span className={styles.kcal} aria-live="polite">
            {formatKcal(kcal)}
            <span className={styles.unit}>kcal</span>
          </span>
        </span>
        {/* Deliberately quiet, and deliberately there: a MET curve is a population average, so
            this is a ballpark, not a measurement. */}
        <span className={styles.estimated}>Estimated</span>
      </div>
    </div>
  );
}
