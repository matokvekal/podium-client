/**
 * "When does the ride start?": a day shortcut, then a time shortcut (two taps), with the full
 * pickers one tap away.
 *
 * It reads and writes the draft's `startDate` / `startTime`; the draft joins them into `startsAt`
 * (engine/flow.ts), so everything downstream sees the value it always did. Nothing here runs on
 * its own: opening this question on a draft that already has a valid start never rewrites it.
 *
 * Calendar rules (engine/quick-dates.ts): the shortcuts are the rider's own next Friday /
 * Saturday / Sunday after today. A day picked by hand starts in the CURRENT year; the year only
 * changes when the rider changes it, and a date that has passed is flagged, never "fixed".
 */

import { useState } from "react";
import { MONTH_NAMES } from "../../lib/ride-date";
import {
  currentYear,
  joinDateParts,
  nextWeekday,
  QUICK_TIMES,
  type QuickDay,
  quickDayOf,
  splitDateString,
  toDateString,
} from "../engine/quick-dates";
import { formatStart, type StudioKey, t } from "../i18n";
import type { BodyProps } from "./QuestionBodies";
import styles from "./studio.module.css";

const QUICK_DAYS: { day: QuickDay; labelKey: StudioKey }[] = [
  { day: "fri", labelKey: "start.nextFri" },
  { day: "sat", labelKey: "start.nextSat" },
  { day: "sun", labelKey: "start.nextSun" },
];

function intlLocale(locale: "en" | "he"): string {
  return locale === "he" ? "he-IL" : "en-GB";
}

/** "16 Oct" / "16 באוק׳" for a "YYYY-MM-DD", in the studio's language. */
function shortDay(locale: "en" | "he", iso: string): string {
  const p = splitDateString(iso);
  if (!p) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(
    new Date(p.year, p.month - 1, p.day),
  );
}

function monthName(locale: "en" | "he", month: number): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long" }).format(
    new Date(2024, month - 1, 1),
  );
}

export function StartPicker({
  draft,
  locale,
  onAnswer,
  now = new Date(),
}: BodyProps & { now?: Date }) {
  const today = toDateString(now);
  const quick = quickDayOf(draft.startDate, now);
  const typedTime =
    draft.startTime !== "" && !(QUICK_TIMES as readonly string[]).includes(draft.startTime);

  // Which "other" pickers are open. A saved date that is not a shortcut opens its picker so it
  // is shown rather than hidden; a fresh question shows neither.
  const [otherDate, setOtherDate] = useState(draft.startDate !== "" && quick === null);
  const [otherTime, setOtherTime] = useState(typedTime);

  // The hand-picked day, kept as the three parts so a half-picked day survives re-renders. The
  // year starts as the rider's current year, or the year of the date already chosen.
  const [parts, setParts] = useState(() => {
    const existing = splitDateString(draft.startDate);
    return existing ?? { year: currentYear(now), month: 0, day: 0 };
  });

  function pickParts(next: { year: number; month: number; day: number }) {
    setParts(next);
    const iso = joinDateParts(next);
    if (iso) onAnswer("startDate", iso);
  }

  const years = [currentYear(now), currentYear(now) + 1, currentYear(now) + 2];
  if (parts.year && !years.includes(parts.year)) years.unshift(parts.year);
  const dayCount = parts.month ? new Date(parts.year || 2024, parts.month, 0).getDate() : 31;
  const isPast = draft.startDate !== "" && draft.startDate < today;
  const when = draft.startsAt ? formatStart(locale, draft.startsAt) : "";

  return (
    <div className={styles.startPicker}>
      <fieldset className={styles.chipGroup}>
        <legend className={styles.chipLegend}>{t(locale, "start.dateLegend")}</legend>
        <div className={styles.chipRow}>
          {QUICK_DAYS.map(({ day, labelKey }) => {
            const iso = nextWeekday(day, now);
            return (
              <button
                key={day}
                type="button"
                className={styles.chip}
                aria-pressed={quick === day && !otherDate}
                onClick={() => {
                  setOtherDate(false);
                  setParts(splitDateString(iso) ?? parts);
                  onAnswer("startDate", iso);
                }}
              >
                <span>{t(locale, labelKey)}</span>
                <span className={styles.chipSub}>{shortDay(locale, iso)}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={styles.chip}
            aria-pressed={otherDate}
            onClick={() => setOtherDate(true)}
          >
            <span>{t(locale, "start.otherDate")}</span>
          </button>
        </div>
      </fieldset>

      {otherDate ? (
        <div className={styles.dateRow}>
          <select
            className={styles.select}
            aria-label={t(locale, "start.day")}
            value={parts.day || ""}
            onChange={(e) => pickParts({ ...parts, day: Number(e.target.value) })}
          >
            <option value="">{t(locale, "start.day")}</option>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {String(d).padStart(2, "0")}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label={t(locale, "start.month")}
            value={parts.month || ""}
            onChange={(e) => pickParts({ ...parts, month: Number(e.target.value) })}
          >
            <option value="">{t(locale, "start.month")}</option>
            {MONTH_NAMES.map((_, i) => (
              <option key={MONTH_NAMES[i]} value={i + 1}>
                {monthName(locale, i + 1)}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label={t(locale, "start.year")}
            value={parts.year || ""}
            onChange={(e) => pickParts({ ...parts, year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <fieldset className={styles.chipGroup}>
        <legend className={styles.chipLegend}>{t(locale, "start.timeLegend")}</legend>
        <div className={styles.chipRow}>
          {QUICK_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              className={`${styles.chip} ${styles.chipTime}`}
              aria-pressed={draft.startTime === time && !otherTime}
              onClick={() => {
                setOtherTime(false);
                onAnswer("startTime", time);
              }}
            >
              <bdi>{time}</bdi>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.chip} ${styles.chipTime}`}
            aria-pressed={otherTime}
            onClick={() => setOtherTime(true)}
          >
            <span>{t(locale, "start.otherTime")}</span>
          </button>
        </div>
      </fieldset>

      {otherTime ? (
        <input
          type="time"
          className={`${styles.select} ${styles.timeInput}`}
          aria-label={t(locale, "start.customTime")}
          value={draft.startTime}
          onChange={(e) => onAnswer("startTime", e.target.value)}
        />
      ) : null}

      {isPast ? (
        <p className={styles.error} role="alert">
          {t(locale, "start.past")}
        </p>
      ) : when ? (
        <p className={styles.startReadout} aria-live="polite">
          {t(locale, "start.chosen", { when })}
        </p>
      ) : null}
    </div>
  );
}
