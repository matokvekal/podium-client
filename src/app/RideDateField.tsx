import { useEffect, useRef, useState } from "react";
import {
  type DateParts,
  MONTH_NAMES,
  datePartsToIso,
  daysInMonth,
  formatRideStart,
  isPastDatetimeLocal,
  joinDatetimeLocal,
  splitDatetimeLocal,
} from "../lib/ride-date";
import styles from "./RideDateField.module.css";

interface Props {
  id: string;
  /** "YYYY-MM-DDTHH:mm" (local) or "" — the form's startsAt, unchanged in shape. */
  value: string;
  /** Class of the form's own inputs, so the pickers look like every other field. */
  inputClassName: string;
  /**
   * `value` is "" until the date AND the time are both filled (exactly what the old
   * datetime-local gave). `draftDate` is the picked day even while the time is still empty,
   * so a time quick-chip can land on it instead of jumping to next Saturday.
   */
  onChange: (value: string, draftDate: string | null) => void;
}

/**
 * Day | month BY NAME | year + the native time field. See lib/ride-date.ts for why a typed
 * numeric date is gone. Years offered: this one and the next two.
 */
export function RideDateField({ id, value, inputClassName, onChange }: Props) {
  const [date, setDate] = useState<DateParts>(() => splitDatetimeLocal(value).date);
  const [time, setTime] = useState(() => splitDatetimeLocal(value).time);
  // The last value this field reported, so a parent re-render with that same value does not
  // wipe a half-picked date. Any OTHER value (a quick chip, the edit prefill) is adopted.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (!value) return; // the parent never clears a half-picked date
    const split = splitDatetimeLocal(value);
    setDate(split.date);
    setTime(split.time);
  }, [value]);

  function emit(nextDate: DateParts, nextTime: string) {
    const next = joinDatetimeLocal(nextDate, nextTime);
    lastEmitted.current = next;
    onChange(next, datePartsToIso(nextDate));
  }

  function pick(part: keyof DateParts, raw: string) {
    const nextDate = { ...date, [part]: Number(raw) };
    setDate(nextDate);
    emit(nextDate, time);
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1, thisYear + 2];
  if (date.year && !years.includes(date.year)) years.unshift(date.year); // an older ride's year
  const dayCount = date.month ? daysInMonth(date.month, date.year) : 31;
  const readout = formatRideStart(value);

  return (
    <>
      <div className={styles.row}>
        <select
          id={id}
          aria-label="Day"
          className={inputClassName}
          value={date.day || ""}
          onChange={(e) => pick("day", e.target.value)}
        >
          <option value="">Day</option>
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {String(day).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          aria-label="Month"
          className={inputClassName}
          value={date.month || ""}
          onChange={(e) => pick("month", e.target.value)}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          className={inputClassName}
          value={date.year || ""}
          onChange={(e) => pick("year", e.target.value)}
        >
          <option value="">Year</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <input
          type="time"
          aria-label="Time"
          className={inputClassName}
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            emit(date, e.target.value);
          }}
        />
      </div>
      {readout && (
        <p className={styles.readout} data-past={isPastDatetimeLocal(value) || undefined}>
          {readout}
          {isPastDatetimeLocal(value) ? " — this date has already passed" : ""}
        </p>
      )}
    </>
  );
}
