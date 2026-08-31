// The line an invited rider reads across the top of a ride's hero image.
//
// Pure string building, kept out of the page so the wording is testable and lives in one
// place — the same reason event-visuals.ts owns status labels.

import type { InviteSource } from "../store/invitedEventsStore";
import { formatLocalDayMonthYear } from "./time";

/**
 * How someone arrived changes what this should say, because the two are different social
 * situations:
 *
 *   link  Someone else decided to send this. The rider is being ASKED, and may not yet know
 *         what the ride is → "You are invited to …".
 *   qr    They pointed a camera at an organizer's QR code, almost always standing in front of
 *         it. Nobody needs telling they were invited to something they walked up to — the only
 *         open question is whether they are in → "Join …".
 *   code  Typed the code in by hand. Just as deliberate as a scan, so it reads the same.
 *
 * The date is included when the event has one and quietly dropped when it does not, rather
 * than printing an em dash into the middle of a sentence.
 *
 * No "the" before the name ("Join the Dawn Patrol") — it reads well for some names and badly
 * for others, and this app already carries Hebrew ride names where an English article is
 * simply wrong.
 */
export function inviteGreeting(
  eventName: string,
  startsAt: string | null | undefined,
  via: InviteSource | undefined,
): string {
  // An invite persisted before `via` existed has no source. "link" is the safe reading: it
  // greets the reader rather than assuming they already know what this is.
  const opener = via === "qr" || via === "code" ? "Join" : "You are invited to";
  const name = eventName.trim();
  const when = startsAt ? formatLocalDayMonthYear(startsAt) : null;
  return when ? `${opener} ${name} at ${when}` : `${opener} ${name}`;
}
