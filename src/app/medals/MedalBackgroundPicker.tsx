// Create/Edit Ride: the organizer chooses the medal's background — one of 20 colours × one of 10
// styles. Two radio groups, each a single swipeable row (phone-first), each operable by keyboard
// (arrow keys move the choice, like a native radio group). The parent shows the live preview.

import type { KeyboardEvent } from "react";
import {
  DEFAULT_MEDAL_COLOR,
  DEFAULT_MEDAL_STYLE,
  MEDAL_COLORS,
  MEDAL_STYLES,
  medalBackgroundVars,
  medalColor,
  medalStyle,
} from "../../lib/medal-backgrounds";
import styles from "./Medals.module.css";

function arrowMove<T extends { id: string }>(
  e: KeyboardEvent,
  list: readonly T[],
  current: string,
  pick: (id: string) => void,
) {
  const delta =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!delta) return;
  e.preventDefault();
  // Mirror left/right in an RTL document so "next" is always the way the row reads.
  const rtl = document.dir === "rtl" && (e.key === "ArrowRight" || e.key === "ArrowLeft");
  const i = list.findIndex((x) => x.id === current);
  const next = list[(i + (rtl ? -delta : delta) + list.length) % list.length];
  if (!next) return;
  pick(next.id);
  const el = (e.currentTarget.parentElement?.querySelector(
    `[data-id="${next.id}"]`,
  ) ?? null) as HTMLElement | null;
  el?.focus();
  el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function MedalBackgroundPicker({
  colorId,
  styleId,
  onChange,
}: {
  colorId: string;
  styleId: string;
  onChange(next: { colorId: string; styleId: string }): void;
}) {
  const color = medalColor(colorId);
  const style = medalStyle(styleId);
  const isDefault = color.id === DEFAULT_MEDAL_COLOR && style.id === DEFAULT_MEDAL_STYLE;

  return (
    <div className={styles.picker} data-testid="medal-background-picker">
      <p className={styles.pickerHeading} id="medal-color-label">
        Medal background
        <span className={styles.pickerChosen}>
          {color.name} · {style.name}
        </span>
      </p>

      <div className={styles.pickerRow} role="radiogroup" aria-labelledby="medal-color-label">
        {MEDAL_COLORS.map((c) => {
          const on = c.id === color.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              data-id={c.id}
              tabIndex={on ? 0 : -1}
              className={styles.swatch}
              style={{ background: c.base, ...(c.id === "classic" ? { backgroundImage: "radial-gradient(circle at 50% 20%, rgba(247,201,72,0.45), transparent 70%)" } : {}) }}
              onClick={() => onChange({ colorId: c.id, styleId: style.id })}
              onKeyDown={(e) =>
                arrowMove(e, MEDAL_COLORS, color.id, (id) => onChange({ colorId: id, styleId: style.id }))
              }
            />
          );
        })}
      </div>

      <p className={styles.pickerHeading} id="medal-style-label">
        Style
      </p>
      <div
        className={styles.pickerRow}
        role="radiogroup"
        aria-labelledby="medal-style-label"
        style={medalBackgroundVars(color.id, style.id)}
      >
        {MEDAL_STYLES.map((s) => {
          const on = s.id === style.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-id={s.id}
              tabIndex={on ? 0 : -1}
              className={styles.styleTile}
              onClick={() => onChange({ colorId: color.id, styleId: s.id })}
              onKeyDown={(e) =>
                arrowMove(e, MEDAL_STYLES, style.id, (id) => onChange({ colorId: color.id, styleId: id }))
              }
            >
              <span className={styles.styleSample} style={medalBackgroundVars(color.id, s.id)} />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className={styles.pickerFooter}>
        <span>
          {MEDAL_COLORS.length} colours × {MEDAL_STYLES.length} styles · every rider gets this look
        </span>
        {!isDefault && (
          <button
            type="button"
            className={styles.pickerReset}
            onClick={() => onChange({ colorId: DEFAULT_MEDAL_COLOR, styleId: DEFAULT_MEDAL_STYLE })}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
