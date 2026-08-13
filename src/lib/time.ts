// Time display.
//
// The database and the API only ever deal in UTC. Every rider sees times in THEIR OWN
// device timezone, so a rider in Israel and one in Italy read the same instant correctly
// without the server knowing anything about either of them.
//
// Rules: never send a local time to the server, never compare local times, and never
// hardcode a timezone here — the browser's own is always the right one.

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function toDate(utcIso: string | Date | null | undefined): Date | null {
  if (!utcIso) return null;
  const date = utcIso instanceof Date ? utcIso : new Date(utcIso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 14:32 — for anything happening today, like a last-seen time on the live map. */
export function formatLocalTime(utcIso: string | Date | null | undefined): string {
  const date = toDate(utcIso);
  return date ? timeFormat.format(date) : "—";
}

/** 13 Aug, 14:32 — for event lists and history. */
export function formatLocalDateTime(utcIso: string | Date | null | undefined): string {
  const date = toDate(utcIso);
  return date ? dateTimeFormat.format(date) : "—";
}

/** Wed, 13 Aug 2026 — for headings. */
export function formatLocalDate(utcIso: string | Date | null | undefined): string {
  const date = toDate(utcIso);
  return date ? dateFormat.format(date) : "—";
}

/** "4 min ago" — how fresh a rider's position is. Deliberately coarse. */
export function formatAge(utcIso: string | Date | null | undefined, now = Date.now()): string {
  const date = toDate(utcIso);
  if (!date) return "never";

  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatLocalDateTime(date);
}

/** 1:23:45 or 12:34 — elapsed or finish time, never a clock time. */
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
