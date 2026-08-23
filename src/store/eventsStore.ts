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
  type EventSummary,
  getCachedEvents,
  putCachedEvent,
  putCachedEvents,
  toggleFavorite,
} from "../lib/local-db";

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
  myRides: EventSummary[];
  myRidesLoading: boolean;
  otherRides: EventSummary[];
  otherLoading: boolean;
  otherError: string | null;
  loadMyRides(authed: boolean): Promise<void>;
  loadOtherRides(): Promise<void>;
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
  myRidesLoading: false,
  otherRides: [],
  otherLoading: true,
  otherError: null,

  async loadMyRides(authed) {
    if (!authed) {
      set({ myRides: [] });
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
      set({ myRides: merged });
      putCachedEvents("mine", merged);
    } catch {
      // A cache read above may already be showing something; leave it. Otherwise this fails
      // silently — the same behavior a real signed-in rider with no cache and no connectivity
      // already saw.
    } finally {
      if (requestId === myRidesRequestId) set({ myRidesLoading: false });
    }
  },

  async loadOtherRides() {
    const requestId = ++otherRidesRequestId;

    const cached = await getCachedEvents("guest");
    if (requestId === otherRidesRequestId && cached.length > 0) {
      set({ otherRides: cached, otherLoading: false });
    }

    try {
      const result = await apiRequest<EventSummary[]>("/events/public", { anonymous: true });
      if (requestId !== otherRidesRequestId) return;
      set({ otherRides: result, otherError: null });
      putCachedEvents("guest", result);
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
    set({ myRides: [] });
    void clearCachedEvents("mine");
  },
}));
