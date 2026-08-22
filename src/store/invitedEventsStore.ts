// Client-only record of events a rider was sent a join link/code for, kept separate from
// "My Rides" (owned/joined, from GET /events?filter=joined) and "Find Rides" (public
// discovery). Populated whenever JoinPage.tsx's lookUp() resolves a code — whether that's a
// scanned/shared link landing on /join/:code or a manually typed code — and cleared once the
// rider actually joins (JoinPage.tsx's join(), which is when the event graduates into My
// Rides for real) or dismisses it by hand. No server column for this; same "client-only,
// persisted to localStorage keyed by event id" pattern as store/eventExtrasStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface InvitedEvent {
  eventId: string;
  code: string;
  name: string;
  type: "RIDE" | "RACE";
  invitedAt: number;
}

interface InvitedEventsState {
  byEventId: Record<string, InvitedEvent>;
  addInvite(event: InvitedEvent): void;
  removeInvite(eventId: string): void;
}

export const useInvitedEventsStore = create<InvitedEventsState>()(
  persist(
    (set) => ({
      byEventId: {},

      addInvite(event) {
        set((state) => ({
          byEventId: { ...state.byEventId, [event.eventId]: event },
        }));
      },

      removeInvite(eventId) {
        set((state) => {
          if (!(eventId in state.byEventId)) return state;
          const byEventId = { ...state.byEventId };
          delete byEventId[eventId];
          return { byEventId };
        });
      },
    }),
    { name: "podium.invitedEvents" },
  ),
);

export type { InvitedEvent };
