// The ride's start DATE, entered and shown so it cannot be misread whatever the browser's
// language is.
//
// Why: the create form used one <input type="datetime-local">. The browser lays its parts out in
// ITS OWN locale order, so with an English (US) browser "07/11/2026" filled month=07, day=11 and
// a ride meant for 7 November was saved for 11 July (it then vanished into Past within minutes).
// The app never parsed that string — the browser did — so the fix is to stop typing numeric
// dates at all: day, month BY NAME, year, each its own picker. The time part is untouched: it is
// still a native HH:mm field and the value is still the same "YYYY-MM-DDTHH:mm" string the rest
// of the form (quick chips, toISOString on save) has always used.
//
// Month and weekday names come from fixed English arrays, never Intl, so the output is the same
// on every device.

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A calendar day as the three pickers hold it. 0 = not picked yet. `month` is 1..12. */
export interface DateParts {
  day: number;
  month: number;
  year: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(month: number, year: number): number {
  // Day 0 of the NEXT month is the last day of this one. With no year yet, assume a leap year
  // so 29 Feb stays pickable until the year says otherwise.
  return new Date(year || 2024, month, 0).getDate();
}

/** "2026-11-07T07:00" -> its date parts and "07:00". Anything else -> empty parts, "". */
export function splitDatetimeLocal(value: string): { date: DateParts; time: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match) return { date: { day: 0, month: 0, year: 0 }, time: "" };
  return {
    date: { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    time: match[4],
  };
}

/** "YYYY-MM-DD" once all three parts are picked and form a real day (no 31 Nov), else null. */
export function datePartsToIso(date: DateParts): string | null {
  const { day, month, year } = date;
  if (!day || !month || !year) return null;
  if (day > daysInMonth(month, year)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The form's "YYYY-MM-DDTHH:mm" value, or "" while the date or the time is incomplete —
 *  the same "nothing until both halves are filled" a datetime-local input gives. */
export function joinDatetimeLocal(date: DateParts, time: string): string {
  const iso = datePartsToIso(date);
  if (!iso || !/^\d{2}:\d{2}$/.test(time)) return "";
  return `${iso}T${time}`;
}

/** 07-Nov-2026 */
export function formatRideDay(date: Date): string {
  return `${pad(date.getDate())}-${MONTH_NAMES[date.getMonth()]}-${date.getFullYear()}`;
}

/** "Saturday, 07-Nov-2026 at 07:00" for a "YYYY-MM-DDTHH:mm" value (read as local time, like
 *  every other datetime-local value in this form). "" when the value is incomplete. */
export function formatRideStart(value: string): string {
  const { date, time } = splitDatetimeLocal(value);
  const iso = datePartsToIso(date);
  if (!iso || !time) return "";
  const local = new Date(`${iso}T${time}`);
  return `${WEEKDAY_NAMES[local.getDay()]}, ${formatRideDay(local)} at ${time}`;
}

/** True when a complete "YYYY-MM-DDTHH:mm" value is earlier than `now`. */
export function isPastDatetimeLocal(value: string, now: Date = new Date()): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < now.getTime();
}
