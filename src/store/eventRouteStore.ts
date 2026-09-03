// The route an organizer actually picked (or uploaded) for this event on EventCreatePage.tsx —
// client-only, same "no server column yet" story as store/eventExtrasStore.ts. There is no
// event_routes attach endpoint (see EventCreatePage.tsx's Track section doc comment), so the
// picked route never reaches the server; without this store, every event's map fell back to
// a fabricated deterministic-by-id mock route instead of what the organizer actually chose.
// Persisted to localStorage keyed by event id, same pattern as eventExtrasStore/eventGroupsStore.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventRoute } from "../lib/event-route";

interface EventRouteState {
  byEvent: Record<string, EventRoute>;
  setRoute(eventId: string, route: EventRoute): void;
  clearRoute(eventId: string): void;
}

export const useEventRouteStore = create<EventRouteState>()(
  persist(
    (set) => ({
      byEvent: {},

      setRoute(eventId, route) {
        set((state) => ({
          byEvent: { ...state.byEvent, [eventId]: route },
        }));
      },

      // The organizer removed the track on the edit form — drop the local copy too, so the
      // detail page and results don't keep drawing a route the event no longer has.
      clearRoute(eventId) {
        set((state) => {
          const next = { ...state.byEvent };
          delete next[eventId];
          return { byEvent: next };
        });
      },
    }),
    { name: "podium.eventRoute" },
  ),
);

/** Non-hook read for resultsStore.ts, same shape as eventExtrasStore's getEventExtras. */
export function getEventRoute(eventId: string): EventRoute | null {
  return useEventRouteStore.getState().byEvent[eventId] ?? null;
}
