// Event route for one event — real data only. The route comes from the server
// (GET /events/:eventId/route, elnino-server/src/modules/routes), which is the actual
// route the organizer attached, visible to every viewer, not just the creator's own
// device. Falling back to eventRouteStore.ts's local cache (same-device convenience, or
// the network call failing) covers a viewer who just picked/saved a route seconds ago
// and is still offline. If genuinely neither exists, `route` is null — the UI shows an
// honest empty state, never a fabricated route (see BUGS.md: "No route = show proper
// empty/no-route state, never mock data").
//
// This store used to also carry a rider list + organizer info from lib/mock-results.ts's
// getEventResults — fabricated riders that real events never had ("i create ride, i
// didnt add riders but how i do see riders, its bug"). That is gone: the rider list is
// the real GET /events/:eventId/participants (see EventDetailPage.tsx's realRoster and
// store/participantsStore.ts), and organizer name/avatar come from the event itself
// (ownerName/ownerAvatarUrl).
//
// No IndexedDB caching layer here, unlike eventsStore.ts — GET /events/:eventId/route is
// cheap and polled on every page load, same as the rest of this store.

import { create } from "zustand";
import { ApiError, apiRequest } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";
import { getEventRoute } from "./eventRouteStore";

/** What GET /events/:eventId/route actually sends — see routes.schemas.ts server-side. */
type ServerRoute = Pick<EventRoute, "points" | "distanceKm" | "elevationM">;

interface ResultsState {
  results: { route: EventRoute | null };
  loading: boolean;
  error: string | null;
  loadResults(eventId: string): Promise<void>;
}

let requestId = 0;

export const useResultsStore = create<ResultsState>((set) => ({
  results: { route: null },
  loading: true,
  error: null,

  async loadResults(eventId) {
    const thisRequest = ++requestId;
    set({ loading: true, error: null });
    try {
      let route: EventRoute | null = null;
      let serverReadSucceeded = false;
      try {
        const serverRoute = await apiRequest<ServerRoute | null>(`/events/${eventId}/route`);
        if (thisRequest !== requestId) return;
        serverReadSucceeded = true;
        if (serverRoute) route = serverRoute;
      } catch (err) {
        if (thisRequest !== requestId) return;
        // Only true network/offline failures use same-device local fallback. Permission
        // failures or a real server null route must remain server truth (empty state).
        if (!(err instanceof ApiError) || !err.isOffline) {
          serverReadSucceeded = true;
        }
      }
      if (!serverReadSucceeded && !route) route = getEventRoute(eventId);

      set({ results: { route }, loading: false });
    } catch {
      if (thisRequest !== requestId) return;
      set({ error: "Could not load results right now.", loading: false });
    }
  },
}));
