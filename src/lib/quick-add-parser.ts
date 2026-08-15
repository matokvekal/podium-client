// "Quick add" date parsing for EventCreatePage's description field — typing something like
// "2 groups: strong 50km, weak 20km, next Saturday" should fill in a start date without the
// organizer touching the date picker at all.
//
// Deliberately NOT a real model — asked for directly ("if ther is not to much memory just
// sujest"): a phone-class device running this in a form field has no business loading a
// language model for one date phrase. This is plain keyword/regex matching, same spirit as
// every other "mock until something real is worth building" piece of this app, except this
// one is genuinely the whole solution, not a stand-in for a server call.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Most rides here start early — see mock-my-rides.ts's seed data, almost all early-morning.
// Used only when a date phrase was found but no time was mentioned alongside it.
const DEFAULT_HOUR = 6;

export interface QuickAddResult {
  date: Date;
  /** Human-readable summary of what was detected, for the "Detected: …" hint under the field. */
  label: string;
}

function atHour(date: Date, hour: number, minute: number): Date {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function nextWeekday(from: Date, targetDay: number, includeToday: boolean): Date {
  const result = new Date(from);
  const currentDay = result.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  result.setDate(result.getDate() + delta);
  return result;
}

function findExplicitTime(text: string): { hour: number; minute: number } | null {
  // "at 6", "at 6:30am", "07:00", "6am" — the common ways someone types a time in passing.
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;
  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  // Bare numbers under 8 with no am/pm are more often a distance ("50", "20") than a time —
  // only trust a bare number when it's paired with a colon or am/pm, or it reads as a
  // plausible ride start hour (5-11).
  if (!meridiem && !match[2] && !(hour >= 5 && hour <= 11)) return null;
  return { hour, minute };
}

/**
 * Looks for one relative-date phrase in free text and returns the date it resolves to,
 * defaulting the time to DEFAULT_HOUR unless the text also mentions a time. Returns null when
 * nothing recognizable is found — callers should leave the date field alone in that case, not
 * clear it.
 */
export function parseQuickAdd(text: string, now: Date = new Date()): QuickAddResult | null {
  const lower = text.toLowerCase();
  const time = findExplicitTime(lower);
  const hour = time?.hour ?? DEFAULT_HOUR;
  const minute = time?.minute ?? 0;

  if (/\btoday\b/.test(lower)) {
    return { date: atHour(now, hour, minute), label: "today" };
  }
  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return { date: atHour(date, hour, minute), label: "tomorrow" };
  }

  const inDays = lower.match(/\bin (\d+) days?\b/);
  if (inDays) {
    const date = new Date(now);
    date.setDate(date.getDate() + Number.parseInt(inDays[1], 10));
    return { date: atHour(date, hour, minute), label: `in ${inDays[1]} days` };
  }

  const inWeeks = lower.match(/\bin (\d+) weeks?\b/);
  if (inWeeks) {
    const date = new Date(now);
    date.setDate(date.getDate() + Number.parseInt(inWeeks[1], 10) * 7);
    return { date: atHour(date, hour, minute), label: `in ${inWeeks[1]} weeks` };
  }

  // "next month"/"in N months" keep the same day-of-month where possible (the 15th → the
  // 15th) — setMonth() on a Date already rolls over correctly for a short month (e.g. Jan 31
  // + 1 month lands on Mar 3, not an invalid Feb 31), which is an acceptable edge case for a
  // quick-add shortcut rather than a date picker.
  if (/\bnext month\b/.test(lower)) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + 1);
    return { date: atHour(date, hour, minute), label: "next month" };
  }
  const inMonths = lower.match(/\bin (\d+) months?\b/);
  if (inMonths) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + Number.parseInt(inMonths[1], 10));
    return { date: atHour(date, hour, minute), label: `in ${inMonths[1]} months` };
  }

  for (let day = 0; day < WEEKDAYS.length; day++) {
    const name = WEEKDAYS[day];
    if (new RegExp(`\\bnext ${name}\\b`).test(lower)) {
      // "next Saturday" always means the coming one, never today even if today is Saturday.
      const date = nextWeekday(now, day, false);
      return { date: atHour(date, hour, minute), label: `next ${name}` };
    }
    if (new RegExp(`\\bthis ${name}\\b`).test(lower)) {
      const date = nextWeekday(now, day, true);
      return { date: atHour(date, hour, minute), label: `this ${name}` };
    }
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      const date = nextWeekday(now, day, true);
      return { date: atHour(date, hour, minute), label: name };
    }
  }

  return null;
}

/** `datetime-local` input value in the viewer's own local time — never UTC, same rule as the
 * rest of this app's date handling (see lib/time.ts). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
