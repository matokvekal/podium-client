// Event Completion Medals — shared client rules. The dedication limit is counted in WORDS, the same
// way the server counts it (elnino-server src/lib/medal-text.ts), so the form's counter and the
// server's 400 can never disagree.

export const MEDAL_TEXT_MAX_WORDS = 30;
export const MEDAL_TEXT_MAX_CHARS = 600;

/** Words = runs of non-whitespace. Same for Hebrew, Arabic and English. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

/** One medal as GET /medals/me returns it — a permanent snapshot of the ride. */
export interface EventMedal {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  medalText: string;
  awardedAt: string;
  seen: boolean;
  cursor: string;
  /** The organizer's background (lib/medal-backgrounds.ts), snapshotted on the medal. Absent on
   *  every medal awarded before the picker existed — those keep the original look. */
  medalColorId?: string | null;
  medalStyleId?: string | null;
}

/** The Achievements deep link for one ride's medal (Past Ride card -> its medal). */
export function medalHref(eventId: string): string {
  return `/stats/achievements?tab=medals&medal=${encodeURIComponent(eventId)}`;
}

/** "01.01.2026" — the medal's own date style, the same in Hebrew and English. */
export function formatMedalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
