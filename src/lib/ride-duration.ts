// Ride duration — the organizer's estimate of how long the ride takes, entered on the create
// form and shown in the card / detail "Est. Time" slot (which read a hard-coded "soon" until
// this existed). Stored server-side as whole minutes in events.duration_min
// (sql/022-event-ride-plan.sql); this module is only the parse/format layer the form and the
// read views share so they agree on what "2:45" means.
//
// It is an estimate the organizer types, never derived from distance — deriving one would need
// an assumed speed, which is the kind of invented number this app does not ship.

/** Upper bound mirrors the server schema (durationMin ≤ 2880). */
export const MAX_DURATION_MIN = 2880;

/**
 * Parse a human duration string into whole minutes, or null when it is empty / unparseable.
 * Accepts, case-insensitively and ignoring surrounding space:
 *   "2"        → 120   (bare number = hours)
 *   "1.5"      → 90    (decimal hours)
 *   "2:45"     → 165   (h:mm)
 *   "2h"       → 120
 *   "2h30" / "2h 30m" / "2h30m" → 150
 *   "90m" / "90 min" → 90
 * Returns null rather than throwing, so a half-typed field is just "not set yet".
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  let minutes: number | null = null;

  // h:mm
  const colon = s.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (colon) {
    minutes = Number(colon[1]) * 60 + Number(colon[2]);
  }

  // 2h, 2h30, 2h30m, 2h 30 m
  if (minutes === null) {
    const hm = s.match(/^(\d{1,2})\s*h\s*(\d{1,2})?\s*m?$/);
    if (hm) {
      minutes = Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0);
    }
  }

  // 90m, 90 min, 90 mins
  if (minutes === null) {
    const m = s.match(/^(\d{1,4})\s*m(?:in)?s?$/);
    if (m) minutes = Number(m[1]);
  }

  // bare number — treated as hours (whole or decimal)
  if (minutes === null) {
    const n = s.match(/^(\d+(?:\.\d+)?)$/);
    if (n) minutes = Math.round(Number(n[1]) * 60);
  }

  if (minutes === null || !Number.isFinite(minutes)) return null;
  minutes = Math.round(minutes);
  if (minutes <= 0 || minutes > MAX_DURATION_MIN) return null;
  return minutes;
}

/** "2h 45m" / "2h" / "45m". Empty string for null / non-positive — callers render a dash. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Value shown back in the create/edit text input for a stored minute count ("", "1.5", "2:45"). */
export function durationInputValue(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return String(h);
  if (h === 0) return `${m}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Quick-pick chips offered under the field. */
export const DURATION_PRESETS_MIN = [60, 90, 120, 180] as const;
