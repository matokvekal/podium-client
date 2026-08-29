// Event route for one event — real data only, and now durable.
//
// The route comes from the server (GET /events/:eventId/route), which is the actual route the
// organizer attached, visible to every viewer, not just the creator's own device. What changed:
// it is persisted to IndexedDB per viewer (lib/local-db.ts's eventRoutes store) the moment the
// server confirms it, and read back before the network is even attempted.
//
// Two real bugs this replaces, both of which lost a route the app already had:
//
//   1. The only offline fallback was eventRouteStore.ts — localStorage, and written ONLY by
//      EventCreatePage. A rider who joined someone else's ride and merely viewed it never had
//      an entry, so their route vanished the moment the server did. (It was also the wrong
//      medium: a full point list is not localStorage-sized data.)
//   2. The fallback was gated on `err.isOffline`, which is status 0 — no response at all. A
//      server that was reachable but broken (500, or a 502/503 from a proxy) counted as
//      "server read succeeded", so the store committed `route: null` and wiped a perfectly
//      good route off the map. "Server goes down" is exactly that case.
//
// The rule now: the server can only ever REPLACE the route, never erase it by failing. A null
// route is committed only when the server actually said so (a 200 with no route), because that
// is a real answer and the honest empty state — never a fabricated one (BUGS.md: "No route =
// show proper empty/no-route state, never mock data").
//
// eventRouteStore.ts stays as the same-device write-through for a route just picked on
// EventCreatePage, consulted only when nothing has ever been synced for this event.
//
// This store used to also carry a rider list + organizer info from lib/mock-results.ts's
// getEventResults — fabricated riders that real events never had ("i create ride, i didnt add
// riders but how i do see riders, its bug"). That is gone: the rider list is the real
// GET /events/:eventId/participants, and organizer name/avatar come from the event itself.

import { create } from "zustand";
import { ApiError, apiRequest } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";
import { getCachedRoute, putCachedRoute } from "../lib/local-db";
import { useEventExtrasStore } from "./eventExtrasStore";
import { getEventRoute } from "./eventRouteStore";

/**
 * Mirror the server route's distance/climb into the device-local extras store, which is what
 * the ride CARDS read (EventCard.tsx) — the list endpoint carries no route stats, and the
 * extras copy is wiped on logout, so without this a card shows "—" for distance/elevation
 * after any re-login even though the ride's route on the server still has them. Only fills a
 * field the server actually has a number for; never nulls one the organizer may have typed
 * locally.
 */
function mirrorRouteStatsToExtras(
  eventId: string,
  route: Pick<EventRoute, "distanceKm" | "elevationM"> | null,
): void {
  if (!route) return;
  if (route.distanceKm == null && route.elevationM == null) return;
  const store = useEventExtrasStore.getState();
  const current = store.byEvent[eventId];
  store.setDistanceClimb(
    eventId,
    route.distanceKm ?? current?.distanceKm ?? null,
    route.elevationM ?? current?.climbM ?? null,
  );
}

/** What GET /events/:eventId/route actually sends — see routes.schemas.ts server-side. */
type ServerRoute = Pick<EventRoute, "points" | "distanceKm" | "elevationM">;

interface ResultsState {
  results: { route: EventRoute | null };
  loading: boolean;
  error: string | null;
  /** Which event `results` currently describes — guards against a stale write landing after
   *  the viewer has already navigated to a different ride. */
  eventId: string | null;
  /** True when what's on screen came from the cache and the refresh behind it failed. */
  stale: boolean;
  /** When the server last confirmed this route. Null if it never has on this device. */
  lastSyncedAt: number | null;
  loadResults(eventId: string, userId: number): Promise<void>;
}

let requestId = 0;

export const useResultsStore = create<ResultsState>((set) => ({
  results: { route: null },
  loading: true,
  error: null,
  eventId: null,
  stale: false,
  lastSyncedAt: null,

  async loadResults(eventId, userId) {
    const thisRequest = ++requestId;

    // Switching events must clear the previous ride's route immediately — this is a single
    // shared store, and showing ride A's map under ride B's name for a few hundred ms is worse
    // than showing nothing. Re-loading the SAME event keeps what's on screen, which is what
    // makes a reconnect refetch invisible instead of a flash of empty map.
    set((state) =>
      state.eventId === eventId
        ? { loading: true, error: null }
        : {
            loading: true,
            error: null,
            eventId,
            results: { route: null },
            stale: false,
            lastSyncedAt: null,
          },
    );

    // 1. Cache first — paint before the network is even attempted.
    const cached = await getCachedRoute(eventId, userId);
    if (thisRequest !== requestId) return;
    if (cached) {
      set({ results: { route: cached.value }, loading: false, lastSyncedAt: cached.lastSyncedAt });
    }

    // 2. Then the server.
    try {
      const serverRoute = await apiRequest<ServerRoute | null>(`/events/${eventId}/route`);
      if (thisRequest !== requestId) return;
      // Authoritative, including a null: the organizer may have removed the route.
      const route = serverRoute ?? null;
      await putCachedRoute(eventId, userId, route);
      if (thisRequest !== requestId) return;
      mirrorRouteStatsToExtras(eventId, route);
      set({ results: { route }, loading: false, stale: false, lastSyncedAt: Date.now() });
    } catch (err) {
      if (thisRequest !== requestId) return;

      // Anything already on screen from the cache stays exactly as it is. This is the whole
      // point: a failed request is not evidence about the route, so it may not overwrite one.
      if (cached) {
        set({ loading: false, stale: true });
        return;
      }

      // Nothing synced for this event on this device. A route picked locally on this very
      // device (EventCreatePage, not yet round-tripped) is the last real thing we could have,
      // and only a genuine transport failure justifies reaching for it — a 403 means this
      // viewer is not allowed to see the route, and answering that with a local copy would
      // leak it.
      const transportFailed = err instanceof ApiError && err.isOffline;
      const local = transportFailed ? getEventRoute(eventId) : null;
      set({
        results: { route: local },
        loading: false,
        stale: transportFailed,
        error: null,
      });
    }
  },
}));
