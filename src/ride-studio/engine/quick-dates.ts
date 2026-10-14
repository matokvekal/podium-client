/**
 * The date and time shortcuts in the "When does the ride start?" question.
 *
 * All of it is the rider's own calendar: `new Date()` local getters, no UTC arithmetic, so
 * "next Saturday" is the Saturday on the rider's wall calendar whatever timezone the device is
 * in, and the value it produces is the same "YYYY-MM-DD" the draft (and the original form) has
 * always stored. `now` is a parameter so every rule is testable on a fixed instant.
 */

export type QuickDay = "fri" | "sat" | "sun";

/** JavaScript's getDay(): Sunday 0 ... Saturday 6. */
const WEEKDAY: Record<QuickDay, number> = { sun: 0, fri: 5, sat: 6 };

/** The departure times offered as one-tap buttons. */
export const QUICK_TIMES = ["06:00", "06:30", "07:00", "07:30", "08:00"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** A local calendar day as "YYYY-MM-DD". */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The next occurrence of a weekday, strictly after today: asked on a Friday, "next Friday" is
 * seven days away, never today. Crosses month and year ends by calendar arithmetic, so the late
 * December answer is in January of the next year.
 */
export function nextWeekday(day: QuickDay, now: Date = new Date()): string {
  const ahead = (WEEKDAY[day] - now.getDay() + 7) % 7 || 7;
  // Local noon, not midnight: a daylight-saving change can never push the result a day off.
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, 12);
  return toDateString(target);
}

/** The rider's current calendar year: the default year for a day picked by hand. */
export function currentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

export function splitDateString(
  value: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** Which shortcut (if any) a stored day is, so the right button shows as selected. */
export function quickDayOf(startDate: string, now: Date = new Date()): QuickDay | null {
  if (!startDate) return null;
  for (const day of ["fri", "sat", "sun"] as const) {
    if (nextWeekday(day, now) === startDate) return day;
  }
  return null;
}

/** Day, month and year picked by hand -> "YYYY-MM-DD"; "" until all three are set and real. */
export function joinDateParts(parts: { year: number; month: number; day: number }): string {
  const { year, month, day } = parts;
  if (!year || !month || !day) return "";
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return "";
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}
