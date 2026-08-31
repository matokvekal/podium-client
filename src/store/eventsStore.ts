// Global event data — My Rides (signed in) and Other Rides (public), backed by the network
// and the IndexedDB cache in lib/local-db.ts.
//
// Lives outside any one page so it survives navigating away and back without refetching,
// unlike the useState it replaced in EventsListPage.tsx. The store itself never clears on
// unmount, so each loader below guards against an older request's response landing after a
// newer one with a monotonic request id, in place of the per-effect `cancelled` flag a local
// useState/useEffect pair would use.

import { create } from "zustand";
import { apiRequest } from "../lib/api-client";
import {
  clearCachedEvents,
  clearUserScopedCache,
  type EventSource,
  type EventSummary,
  getCachedEvents,
  putCachedEvent,
  putCachedEvents,
  toggleFavorite,
} from "../lib/local-db";

/**
 * Which half of GET /events/public to ask for — the server's own `bucket` param
 * (event.schemas.ts).
 *
 * This matters because the endpoint pages: it answers with at most 20 rows. Asking for
 * everything and filtering client-side, which is what this used to do, meant a busy season's
 * finished rides could fill that page and leave a newcomer looking at an empty Upcoming list
 * while real upcoming rides sat on page two. Asking the server for the bucket the rider is
 * actually looking at is the only version of this that stays correct as the list grows.
 */
export type PublicBucket = "upcoming" | "finished";

/** Each bucket caches into its own slot — see EventSource in lib/local-db.ts. */
const BUCKET_CACHE: Record<PublicBucket, EventSource> = {
  upcoming: "guest",
  finished: "guest-past",
};

function dedupeById(events: EventSummary[]): EventSummary[] {
  const seen = new Set<string>();
  const result: EventSummary[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

interface EventsState {
  /** Owned + joined, merged and deduped — the union. Kept as-is for every existing caller. */
  myRides: EventSummary[];
  /** Ids from GET /events?filter=joined only — i.e. events this user PARTICIPATES in as a
   *  rider, regardless of who owns them. Lets a page tell "I ride this" apart from "I created
   *  this" without a second request. Empty until the first successful load (or on an offline
   *  cold start, where only the merged `myRides` survives in cache). */
  joinedRideIds: string[];
  myRidesLoading: boolean;
  otherRides: EventSummary[];
  otherLoading: boolean;
  otherError: string | null;
  loadMyRides(authed: boolean): Promise<void>;
  /**
   * Find Rides. `bucket` picks which half of the public list to ask the server for and
   * defaults to "upcoming" — see the doc comment on the implementation.
   */
  loadOtherRides(bucket?: PublicBucket): Promise<void>;
  toggleFavoriteRide(id: string): Promise<void>;
  /** Files one authoritative server event — a create response, or the event returned by a
   *  status transition — into My Rides and the IndexedDB cache in one step, so the two never
   *  disagree about an event the server has already told us the truth about. */
  upsertRide(event: EventSummary): void;
  /** Sign-out: drops in-memory My Rides and the "mine" IndexedDB cache bucket so the next
   *  rider on a shared device never briefly sees the previous rider's rides. */
  clearMyRides(): void;
}

let myRidesRequestId = 0;
let otherRidesRequestId = 0;

export const useEventsStore = create<EventsState>((set, get) => ({
  myRides: [],
  joinedRideIds: [],
  myRidesLoading: false,
  otherRides: [],
  otherLoading: true,
  otherError: null,

  async loadMyRides(authed) {
    if (!authed) {
      set({ myRides: [], joinedRideIds: [] });
      return;
    }
    const requestId = ++myRidesRequestId;

    const cached = await getCachedEvents("mine");
    if (requestId === myRidesRequestId && cached.length > 0) {
      set({ myRides: cached });
    }

    set({ myRidesLoading: true });
    try {
      const [mine, joined] = await Promise.all([
        apiRequest<EventSummary[]>("/events?filter=mine"),
        apiRequest<EventSummary[]>("/events?filter=joined"),
      ]);
      if (requestId !== myRidesRequestId) return;
      const merged = dedupeById([...mine, ...joined]);
      set({ myRides: merged, joinedRideIds: joined.map((event) => event.id) });
      putCachedEvents("mine", merged);
    } catch {
      // Never blank My Rides because a request failed. Whatever the cache read above painted
      // stays exactly as it is, and the IndexedDB copy is left untouched — putCachedEvents is
      // only ever reached on the success path, so a failure cannot erase a synced list. The
      // global OFFLINE banner is what tells the rider this is last-synced data.
    } finally {
      if (requestId === myRidesRequestId) set({ myRidesLoading: false });
    }
  },

  async loadOtherRides(bucket: PublicBucket = "upcoming") {
    const requestId = ++otherRidesRequestId;
    const cacheSlot = BUCKET_CACHE[bucket];

    const cached = await getCachedEvents(cacheSlot);
    if (requestId === otherRidesRequestId && cached.length > 0) {
      set({ otherRides: cached, otherLoading: false });
    } else if (requestId === otherRidesRequestId) {
      // Nothing cached for THIS bucket. Switching to Past for the first time must not leave the
      // upcoming rides sitting on screen under a "Past" heading while the fetch runs — an empty
      // list plus the spinner is the honest state.
      set({ otherRides: [], otherLoading: true });
    }

    try {
      // sort=soonest for upcoming (the next ride you could join is the one that matters);
      // latest for past (the ride that just happened, not one from last spring). limit is the
      // server's own max — this list is not paged in the UI, so one generous page is the whole
      // list as far as a rider is concerned.
      const params = new URLSearchParams({
        bucket,
        sort: bucket === "finished" ? "latest" : "soonest",
        limit: "100",
      });
      const result = await apiRequest<EventSummary[]>(`/events/public?${params.toString()}`, {
        anonymous: true,
      });
      if (requestId !== otherRidesRequestId) return;
      set({ otherRides: result, otherError: null });
      putCachedEvents(cacheSlot, result);
    } catch {
      if (requestId !== otherRidesRequestId) return;
      // A cache read above may already be showing something — a failed refresh with cached
      // data on screen fails silently, same as My Rides; only nothing-cached gets the banner.
      if (get().otherRides.length === 0) {
        set({ otherError: "Could not load rides right now." });
      }
    } finally {
      if (requestId === otherRidesRequestId) set({ otherLoading: false });
    }
  },

  async toggleFavoriteRide(id) {
    const favorite = await toggleFavorite(id);
    set((state) => ({
      myRides: state.myRides.map((event) => (event.id === id ? { ...event, favorite } : event)),
    }));
  },

  upsertRide(event) {
    set((state) => {
      const index = state.myRides.findIndex((ride) => ride.id === event.id);
      if (index === -1) return { myRides: [event, ...state.myRides] };
      const myRides = [...state.myRides];
      // Merge, don't replace: a list response carries `favorite` (and whatever else the cache
      // filed) that a single-event response has no reason to know about.
      myRides[index] = { ...myRides[index], ...event };
      return { myRides };
    });
    // "mine" rather than the default "guest" — every caller is the owner acting on their own
    // ride. putCachedEvent keeps an existing source if the event was already filed.
    void putCachedEvent(event, "mine");
  },

  clearMyRides() {
    set({ myRides: [], joinedRideIds: [] });
    void clearCachedEvents("mine");
    // The v2 per-ride caches (detail, route, participants, live) go too — they are the ones
    // holding a rider's private ride content, not just its name in a list.
    void clearUserScopedCache();
  },
}));
