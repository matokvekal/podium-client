/**
 * A from/to range slider — two native range inputs stacked on the same track (the standard
 * technique for a dual-handle slider without a new dependency: only the thumbs are
 * pointer-interactive, the underlying track ignores clicks so the top input's thumb is always
 * reachable). Used by TracksPage for distance/climb range filters.
 */

import styles from "./RangeSlider.module.css";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function RangeSlider({ label, min, max, step, unit, value, onChange }: RangeSliderProps) {
  const [from, to] = value;
  const fromPct = ((from - min) / (max - min)) * 100;
  const toPct = ((to - min) / (max - min)) * 100;

  return (
    <div className={styles.wrap}>
      <div className={styles.labelRow}>
        <span className="muted">{label}</span>
        <span className={styles.valueText}>
          {from} – {to} {unit}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.trackBg} />
        <div
          className={styles.trackFill}
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={from}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), to);
            onChange([next, to]);
          }}
          aria-label={`${label} minimum`}
        />
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={to}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), from);
            onChange([from, next]);
          }}
          aria-label={`${label} maximum`}
        />
      </div>
    </div>
  );
}
