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
  lines.push("", "See you on the road,", "El Niño Ride");

  return lines.join("\n");
}

/** One ride inside a multi-ride invitation — only what the message names.
 *
 *  No `location`: the sibling rides reach this from EventDetail.linkedRides, which carries a
 *  name, a code and a start time and nothing else. Inventing a place for them, or printing a
 *  place under one ride and not the other, would both be worse than stating the day's start
 *  point once. */
export interface ShareInviteRide {
  name: string;
  startsAt: string | null | undefined;
}

/** The day itself — "Saturday, 19 Sep" — without a time, for the heading of a multi-ride
 *  invitation where each ride then states its own. */
function formatDay(startsAt: string): string | null {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${weekdayFormat.format(date)}, ${dayFormat.format(date)} ${monthFormat.format(date)}`;
}

/**
 * The invitation for 2-3 rides sharing one link (server: sql/037).
 *
 * WHY A SEPARATE MESSAGE AND NOT A LOOP OVER shareInviteMessage
 *   The single-ride text answers "you are invited to THIS". This one answers a different
 *   question — "there are two, which are you riding?" — and the reader has to see both options
 *   before they tap. Two full invitations in one chat bubble read as a mistake.
 *
 * The day is stated ONCE, in the heading, because having the same day is the entire reason
 * these rides share a link. Each ride then carries only what differs: its own start time.
 *
 * Same honest caveat as the single-ride message: times render in the SENDER's timezone,
 * because a chat message is a frozen string. The chooser the link opens shows every reader the
 * times in their own.
 */
export function shareInviteMessageMulti(input: {
  rides: ShareInviteRide[];
  /** Where the rides start from, when they share one start point — the organizer's own ride
   *  supplies it. Dropped entirely when absent, never printed as a placeholder. */
  location?: string | null;
  url?: string | null;
}): string {
  const rides = input.rides.filter((ride) => ride.name.trim().length > 0);
  const day = rides.map((ride) => ride.startsAt).find(Boolean);
  const heading = day ? formatDay(day) : null;
  const place = input.location?.trim() || null;

  const lines = [`🚴 You're invited — ${rides.length} rides to choose from!`, ""];
  if (heading) lines.push(`🗓️ ${heading}`);
  if (place) lines.push(`📍 ${place}`);
  if (heading || place) lines.push("");

  for (const ride of rides) {
    const time = ride.startsAt ? formatLocalTime(ride.startsAt) : null;
    lines.push(time ? `• ${ride.name.trim()} — ${time}` : `• ${ride.name.trim()}`);
  }

  if (input.url) lines.push("", `Pick your ride 👉 ${input.url}`);
  lines.push("", "See you on the road,", "El Niño Ride");

  return lines.join("\n");
}

/** The navigator.share subject for a multi-ride link. Says the count, because "You're invited:
 *  Long loop" would name one of two rides and quietly hide the other. */
export function shareInviteTitleMulti(rideCount: number): string {
  return `You're invited: ${rideCount} rides to choose from`;
}

/** The one-line title for navigator.share — what a chat app shows as the subject. */
export function shareInviteTitle(eventName: string): string {
  return `You're invited: ${eventName.trim()}`;
}
