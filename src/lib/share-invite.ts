// The message an organizer actually sends when they share a ride.
//
// Kept out of the sheet component so the wording is testable and lives in one place, same
// reason lib/invite-greeting.ts exists for the banner the recipient then lands on.

import { formatLocalTime } from "./time";

export interface ShareInviteInput {
  eventName: string;
  /** UTC ISO from the API. Rendered in the SENDER's local timezone — see the note below. */
  startsAt: string | null | undefined;
  location: string | null | undefined;
  /** The join URL. Omitted from the text when the channel carries it separately. */
  url?: string | null;
}

// Weekday and day/month as separate single-field formatters, concatenated in a fixed order —
// the same discipline lib/time.ts documents, because Intl orders a combined pattern per locale
// and this line is the whole point of the message.
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });

/**
 * "Saturday, 5 Sep · 08:00".
 *
 * The weekday leads because that is how riders actually hold a ride in their head — "Saturday
 * morning", not "the fifth". Asked for directly ("at Saturday 08:00").
 *
 * One honest caveat: this renders in the SENDER's timezone, because a text message is a frozen
 * string and cannot re-resolve per reader. That is correct for the overwhelming case — an
 * organizer inviting people to a ride in their own city — and the app itself still shows every
 * recipient the time in their own zone once they open the link.
 */
function formatWhen(startsAt: string): string | null {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = `${weekdayFormat.format(date)}, ${dayFormat.format(date)} ${monthFormat.format(date)}`;
  return `${day} · ${formatLocalTime(date)}`;
}

/**
 * A real invitation rather than a product blurb.
 *
 * What was there before — "Join <name> on El Niño Move" — told the reader nothing they needed:
 * not when, not where, and nothing that felt addressed to them. This says the four things
 * someone decides on (what, when, where, and that a person invited them), each on its own line
 * so it stays scannable in a chat bubble and so a Hebrew ride name and an English date never
 * end up on the same line fighting over direction.
 *
 * Missing facts drop their line entirely instead of printing a placeholder — an invitation
 * reading "📍 —" is worse than one that simply does not mention the place.
 */
export function shareInviteMessage({
  eventName,
  startsAt,
  location,
  url,
}: ShareInviteInput): string {
  const name = eventName.trim();
  const when = startsAt ? formatWhen(startsAt) : null;
  const place = location?.trim() || null;

  const lines = ["🚴 Great news — you're invited to ride!", "", name];
  if (when) lines.push(`🗓️ ${when}`);
  if (place) lines.push(`📍 ${place}`);
  if (url) lines.push("", `Tap to join 👉 ${url}`);
  lines.push("", "See you on the road,", "El Niño Move");

  return lines.join("\n");
}

/** The one-line title for navigator.share — what a chat app shows as the subject. */
export function shareInviteTitle(eventName: string): string {
  return `You're invited: ${eventName.trim()}`;
}
