// The one piece of shared state for live location tracking. Read by any page that wants to
// know "is the app currently sharing my GPS, and where am I" (today: LiveEventPage's map and
// status pill); written only by app/LiveLocationProvider.tsx, the single component that owns
// the actual watchPosition lifecycle (see that file for why there must be exactly one).
//
// `activeRide` is the other half: which ride, if any, currently qualifies for tracking. It is
// set by whichever page most recently learned — from a REAL server response, never a cached/
// offline guess — that the signed-in rider is registered on a ride that is live right now. See
// setActiveRideIfCurrent's doc comment for why that distinction is the whole point of this
// store existing.

import { create } from "zustand";
import type { BroadcastStatus } from "../app/useLocationBroadcast";

export interface ActiveRide {
  eventId: string;
  participantId: number;
}

interface LiveLocationState {
  activeRide: ActiveRide | null;
  status: BroadcastStatus;
  selfPosition: [number, number] | null;

  /**
   * Claim (or withdraw) "this ride is live and I'm on it" — called by EventDetailPage and
   * LiveEventPage after a fresh, authoritative GET /events/:eventId, never from a cached or
   * offline-fallback read. That restriction is the actual fix for the bug where a rider could
   * be genuinely registered on a live ride yet never see their own marker: the old per-page
   * hook trusted whatever `event.myParticipant` the page currently had in state, including a
   * cache-derived stand-in that hardcodes it to null while the real fetch is still in flight
   * (or failed once on bad signal at the ride start). Only a confirmed server answer may set or
   * clear this, so a slow/failed first request simply leaves the previous answer (or "unknown,
   * try again") in place instead of asserting "not a participant".
   */
  setActiveRide(ride: ActiveRide | null): void;
  /**
   * Same as setActiveRide(null), but only if the CURRENTLY active ride is this one — so a page
   * for ride A that learns "not live any more" can't stomp on ride B's tracking if the rider
   * has since navigated to a different ride's screen.
   */
  clearActiveRideIfCurrent(eventId: string): void;
  setStatus(status: BroadcastStatus): void;
  setSelfPosition(pos: [number, number] | null): void;
}

/**
 * The one place both EventDetailPage and LiveEventPage report what a FRESH server response
 * (never a cache/offline fallback — see the doc comment on setActiveRide) said about
 * registration + live status, so the two pages can't drift into different rules for "should
 * this ride be tracking".
 */
export function reportRideConfirmation(
  eventId: string,
  status: string,
  effectiveStatus: string | undefined,
  myParticipant: { id: number } | null,
): void {
  const effective = effectiveStatus ?? status;
  const store = useLiveLocationStore.getState();
  if (effective === "live" && myParticipant != null) {
    store.setActiveRide({ eventId, participantId: myParticipant.id });
  } else {
    store.clearActiveRideIfCurrent(eventId);
  }
}

export const useLiveLocationStore = create<LiveLocationState>((set, get) => ({
  activeRide: null,
  status: "off",
  selfPosition: null,

  setActiveRide(ride) {
    set({ activeRide: ride });
  },

  clearActiveRideIfCurrent(eventId) {
    if (get().activeRide?.eventId === eventId) set({ activeRide: null });
  },

  setStatus(status) {
    set({ status });
  },

  setSelfPosition(pos) {
    set({ selfPosition: pos });
  },
}));
