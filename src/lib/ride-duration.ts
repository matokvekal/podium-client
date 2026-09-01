// Ride duration — the organizer's estimate of how long the ride takes, entered on the create
// form and shown in the card / detail "Est. Time" slot (which read a hard-coded "soon" until
// this existed). Stored server-side as whole minutes in events.duration_min
// (sql/022-event-ride-plan.sql); this module is only the format/split layer the form and the
// read views share so they agree on what 165 minutes means.
//
// It is an estimate the organizer sets, never derived from distance — deriving one would need
// an assumed speed, which is the kind of invented number this app does not ship.
//
// This is a DURATION, not a start time. The two are separate fields and must not be conflated:
// startsAt is when the group rolls out, durationMin is how long they expect to be out.
//
// The field used to be free text ("1", "1.5", "2:45") parsed with a small grammar, plus four
// preset chips. It is now two dropdowns — see EventCreatePage — so there is nothing left to
// parse and no way to type something unreadable. The parser and the presets went with it.

/** Upper bound mirrors the server schema (durationMin ≤ 2880 = 48h). */
export const MAX_DURATION_MIN = 2880;

/**
 * Hour values offered by the picker: 0…48, so the control can express exactly the range the
 * server accepts and no more. Long enough for a multi-day audax, and a native <select> on a
 * phone renders it as a scroll wheel, so length costs nothing.
 */
export const DURATION_HOUR_OPTIONS: readonly number[] = Array.from({ length: 49 }, (_, i) => i);

/**
 * Minute values offered by the picker. Five-minute steps: an estimate finer than that is
 * false precision, and twelve wheel rows are far quicker to land on than sixty.
 */
export const DURATION_MINUTE_OPTIONS: readonly number[] = Array.from(
  { length: 12 },
  (_, i) => i * 5,
);

/** "2h 45m" / "2h" / "45m". Empty string for null / non-positive — callers render a dash. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Split a stored minute count into the two values the picker's dropdowns show.
 *
 * `null` in, `null` out for both: "not stated" is a real state for this field and must survive
 * a round trip through the form untouched. It is NOT the same as zero.
 */
export function splitDuration(minutes: number | null | undefined): {
  hours: number | null;
  mins: number | null;
} {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return { hours: null, mins: null };
  }
  const clamped = Math.min(Math.round(minutes), MAX_DURATION_MIN);
  return { hours: Math.floor(clamped / 60), mins: clamped % 60 };
}

/**
 * Combine the two dropdown values back into whole minutes for the server.
 *
 * Both unset, or a total of zero, means "not stated" and sends `null` — the server column is
 * nullable and the read views render a dash. The total is clamped to the server's own bound so
 * a 48h + 55m selection cannot produce a body the API would reject.
 */
export function joinDuration(hours: number | null, mins: number | null): number | null {
  if (hours == null && mins == null) return null;
  const total = (hours ?? 0) * 60 + (mins ?? 0);
  if (total <= 0) return null;
  return Math.min(total, MAX_DURATION_MIN);
}
