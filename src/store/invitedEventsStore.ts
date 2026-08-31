// Client-only record of events a rider was sent a join link/code for, kept separate from
// "My Rides" (owned/joined, from GET /events?filter=joined) and "Find Rides" (public
// discovery). Populated whenever JoinPage.tsx's lookUp() resolves a code — whether that's a
// scanned/shared link landing on /join/:code or a manually typed code — and cleared once the
// rider actually joins (JoinPage.tsx's join(), which is when the event graduates into My
// Rides for real) or dismisses it by hand. No server column for this; same "client-only,
// persisted to localStorage keyed by event id" pattern as store/eventExtrasStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * How this rider came by the code, which decides how the event page greets them.
 *
 *   link  someone sent it to them — passive, so "You are invited to …"
 *   qr    they pointed a camera at an organizer's QR — an act they chose, so "Join …"
 *   code  they typed the code in by hand — equally deliberate, greeted like a QR
 *
 * A QR is told apart from a link by the URL it encodes: ShareEventSheet builds the QR with
 * `?via=qr` while the copyable link stays clean, so a scan is recognisable no matter which
 * scanner made it — the phone's own camera app included, which is how most people scan.
 * Without that marker both arrive at the same /join/:code and are indistinguishable.
 */
type InviteSource = "link" | "qr" | "code";

interface InvitedEvent {
  eventId: string;
  code: string;
  name: string;
  type: "RIDE" | "RACE";
  invitedAt: number;
  /** Optional: records persisted before this field existed simply have no source, and are
   *  treated as "link" — the safe reading, since it greets rather than assumes. */
  via?: InviteSource;
  /** Start time, copied off the event when the code resolved, so the invitation banner can
   *  name the date without waiting on a second request. Optional for the same reason as
   *  `via`. */
  startsAt?: string | null;
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

export type { InvitedEvent, InviteSource };
