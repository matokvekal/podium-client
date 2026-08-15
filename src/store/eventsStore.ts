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
import { getAccessToken } from "../lib/auth-storage";
import {
  type EventSummary,
  getCachedEvents,
  putCachedEvents,
  toggleFavorite,
} from "../lib/local-db";
import { MOCK_MY_RIDES } from "../lib/mock-my-rides";
import { MOCK_OTHER_RIDES } from "../lib/mock-other-rides";

// Sentinel access token AuthContext.signInAsLocalDevUser writes — see mock-my-rides.ts.
const LOCAL_DEV_TOKEN = "local-dev-fake";

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
      if (requestId !== myRidesRequestId) return;
      // A cache read above may already be showing something; leave it. Otherwise, the one
      // case worth a fallback: signed in via the client-only local dev sign-in (no real
      // server behind it at all, ever), where an empty My Rides reads as a bug rather than
      // the expected "nothing to fetch from" — see lib/mock-my-rides.ts.
      if (cached.length === 0 && getAccessToken() === LOCAL_DEV_TOKEN) {
        set({ myRides: MOCK_MY_RIDES });
        // Also cache these, same as the real success path above — without this,
        // EventDetailPage's getCachedEvent(id) never finds a mock ride by id (it never went
        // through putCachedEvent either), so opening one from its tile just errors out.
        putCachedEvents("mine", MOCK_MY_RIDES);
      }
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
      // Same one exception as loadMyRides: local dev sign-in has no real server behind it at
      // all, so an empty Find Rides there reads as a bug rather than the expected "nothing to
      // fetch from" — see lib/mock-other-rides.ts.
      if (get().otherRides.length === 0) {
        if (getAccessToken() === LOCAL_DEV_TOKEN) {
          set({ otherRides: MOCK_OTHER_RIDES, otherError: null });
          putCachedEvents("guest", MOCK_OTHER_RIDES);
        } else {
          set({ otherError: "Could not load rides right now." });
        }
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
}));
