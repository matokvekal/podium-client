// Auto check-in, client half: deciding WHEN to ask for a GPS fix, and what the server's answer
// means for whether to keep asking. Pure functions — no clock, no geolocation, no network — so
// every branch is testable (auto-check-in.test.ts). The hook that wires them to the real browser
// is app/useAutoCheckIn.ts.
//
// The server (POST /events/:id/participants/me/check-in) is the authority on every rule; nothing
// here can cause a check-in, it can only decide whether it is worth asking.

import type { EventSummary } from "./local-db";

/**
 * What POST .../participants/me/check-in answers. These strings are the server's API values
 * (lib/auto-check-in.ts and services/participant.service.ts there) — never rename one here.
 */
export type AutoCheckInOutcome =
  | "arrived"
  | "already_recorded"
  | "organizer_decided"
  | "not_approved"
  | "disabled"
  | "closed"
  | "outside_window"
  | "no_start_point"
  | "inaccurate"
  | "too_far";

const FINAL_OUTCOMES: ReadonlySet<AutoCheckInOutcome> = new Set([
  "arrived",
  "already_recorded",
  "organizer_decided",
  "disabled",
  "closed",
  "no_start_point",
]);

/**
 * Should the app stop asking about this ride for the rest of the session?
 *
 * Final: it worked, or nothing this device does can change the answer (the ride has it switched
 * off, is over, has no start point, or an organizer has decided for this rider).
 *
 * Not final — asking again later can succeed: `too_far` (still walking there), `inaccurate` (GPS
 * still locking on), `outside_window` (the window has not opened yet), and `not_approved` (an
 * organizer may approve them at the start line).
 */
export function isFinalOutcome(outcome: AutoCheckInOutcome): boolean {
  return FINAL_OUTCOMES.has(outcome);
}

const CLOSED_STATUSES = new Set(["cancelled", "finished"]);

/**
 * Is this ride worth spending a GPS fix on right now?
 *
 * All of: the organizer switched it on; the rider is on it AS A RIDER (joinedRideIds — an
 * organizer who is not riding has nobody to check in); it is not over; and `now` is within
 * `windowMin` of its start. The server re-checks every one of these, so being wrong here costs
 * at most a wasted prompt or a check-in a minute late, never a wrong check-in.
 */
export function shouldAttemptAutoCheckIn(
  ride: Pick<EventSummary, "id" | "autoCheckIn" | "startsAt" | "status">,
  joinedRideIds: ReadonlySet<string>,
  now: number,
  windowMin: number,
): boolean {
  if (ride.autoCheckIn !== true) return false;
  if (!joinedRideIds.has(ride.id)) return false;
  if (CLOSED_STATUSES.has(ride.status)) return false;
  if (!ride.startsAt) return false;

  const startsAt = Date.parse(ride.startsAt);
  if (Number.isNaN(startsAt)) return false;
  return Math.abs(now - startsAt) <= windowMin * 60_000;
}
