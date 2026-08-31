// Finding a ride by its code when the frozen by-code endpoint won't.
//
// GET /events/by-code/:code resolves ACTIVE events only — its SQL is
// `WHERE code = $1 AND is_active = TRUE`, and the server keeps is_active false for anything
// draft, cancelled or finished. So the moment a ride finishes, its code stops resolving and a
// link that was shared last week answers 404, which the app reported as "No event has that
// code."
//
// That is a lie the reader can catch: the event exists, it is public, and the very same event
// still returns 200 from GET /events/:id. Only the by-code lookup refuses it. Someone opening
// an organizer's link the morning after a ride should see the ride they were invited to, with
// its results — not be told the link is wrong.
//
// The endpoint itself cannot be widened: it is one of the three frozen contracts the shipped
// Android transmitter calls. But GET /events/public is unauthenticated, already carries `code`
// on every row, and with no bucket filter returns finished rides alongside upcoming ones — so
// the code can be resolved from a list the client is allowed to read anyway. No new API, no
// server change.
//
// A private finished ride still will not resolve, and that is correct: it is not in the public
// list, and nothing here should reveal an event the server has not chosen to publish.

import type { EventSummary } from "./local-db";

/** The server generates codes as DDMMYYYY + a letter suffix and matches them exactly; the only
 *  variation a human introduces is case and surrounding space. */
export function normalizeEventCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The one row in a public list whose code matches, or null.
 *
 * Compares normalized on BOTH sides — a code typed into the form arrives however the rider
 * typed it, and a stored code should not be assumed to be clean either.
 */
export function findEventByCode(
  events: readonly EventSummary[],
  code: string,
): EventSummary | null {
  const wanted = normalizeEventCode(code);
  if (!wanted) return null;
  return events.find((event) => normalizeEventCode(event.code) === wanted) ?? null;
}
