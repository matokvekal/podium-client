// The DETAILED line of a track, fetched only when a rider explicitly explores a card's map.
//
// THE THREE LEVELS OF A ROUTE, and which one this is:
//
//   preview   60 points, embedded in every list row (EventSummary.preview) — draws the card.
//   detail    the stored display line, a few hundred points — THIS FILE; GET /events/:id/route.
//   original  the byte-identical GPX — GET /routes/:id/gpx, only on an explicit download.
//
// Nothing here runs while a rider scrolls. It is called from a card's "explore" gesture (a tap on
// "Tap to explore", or a press on the map), so its request count is bounded by what a person can
// deliberately do, not by how far they scroll.
//
// Kept deliberately small: a capped cache so re-exploring a card (or a card scrolling out and back
// in) does not refetch, and one shared promise per ride so a double tap is one request. No
// cancellation — a handful of deliberate requests does not need it.

import { apiRequest } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";

/** Detailed lines held at once. A few hundred points each, so this is well under a megabyte. */
const CACHE_LIMIT = 30;

const cache = new Map<string, EventRoute>();
const pending = new Map<string, Promise<EventRoute | null>>();

/** The detailed line if this ride's has already been fetched, else undefined. */
export function cachedTrackDetail(eventId: string): EventRoute | undefined {
  return cache.get(eventId);
}

/**
 * Fetches (once) the detailed line for a ride. Resolves null when the ride has no route or the
 * request failed — the card then keeps drawing its preview, which is a correct answer to "where
 * does this go", just a coarser one. A failure is not cached, so exploring again retries.
 *
 * `anonymous` for the public list: a public ride's route is served without a token. My Rides
 * stays authenticated, since it can contain a PRIVATE ride only its owner may read.
 */
export function loadTrackDetail(
  eventId: string,
  options: { anonymous: boolean },
): Promise<EventRoute | null> {
  const cached = cache.get(eventId);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(eventId);
  if (inFlight) return inFlight;

  const request = apiRequest<EventRoute | null>(`/events/${eventId}/route`, {
    anonymous: options.anonymous,
  })
    .then((route) => {
      if (!route || route.points.length < 2) return null;
      if (cache.size >= CACHE_LIMIT) {
        // Maps iterate in insertion order, so the first key is the oldest entry.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(eventId, route);
      return route;
    })
    .catch(() => null)
    .finally(() => pending.delete(eventId));

  pending.set(eventId, request);
  return request;
}
