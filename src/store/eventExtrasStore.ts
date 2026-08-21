// Client-only event fields that have no server column yet, but — unlike Activity type on
// EventCreatePage.tsx, which is genuinely "shown, then forgotten" — need to actually persist
// and show up later: Level (so a browsing rider can see the hardness before joining) and the
// organizing club/group name ("each ride can be for group also created by"). Persisted to
// localStorage keyed by event id, same pattern as store/eventGroupsStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurfaceType } from "../lib/mock-tracks";
import type { RiderLevel } from "../lib/rider-level";

interface EventExtras {
  level: RiderLevel | null;
  organizerGroup: string | null;
  /** Links this event into a team's shared schedule (store/teamsStore.ts) — distinct from
   * organizerGroup, which is just the display string. Set together via setTeam() when the
   * organizer picks a team on EventCreatePage.tsx, so organizerGroup always mirrors the
   * team's current name without a second lookup everywhere it's shown. */
  teamId: string | null;
  /** Same "shown, then forgotten" story as everywhere else — but EventCreatePage.tsx's edit
   * mode needs to read it back to prefill the form, so it's persisted here now too. */
  activityType: SurfaceType | null;
  /** Distance/climb — same "no server column yet, but needs to show up again later" story as
   * Level: shown on cards near the difficulty stairs, so a browsing/returning rider can see
   * them without opening the event. Auto-filled from whatever route the organizer picked/
   * uploaded on EventCreatePage.tsx, but a plain number either way, editable by hand — a route
   * doesn't always carry real elevation data (mock routes can have a null climb), and manual
   * entry is the honest fallback rather than leaving it blank. */
  distanceKm: number | null;
  climbM: number | null;
}

const EMPTY_EXTRAS: EventExtras = {
  level: null,
  organizerGroup: null,
  teamId: null,
  activityType: null,
  distanceKm: null,
  climbM: null,
};

interface EventExtrasState {
  byEvent: Record<string, EventExtras>;
  setLevel(eventId: string, level: RiderLevel | null): void;
  setOrganizerGroup(eventId: string, name: string): void;
  setTeam(eventId: string, teamId: string | null, teamName: string | null): void;
  setActivityType(eventId: string, activityType: SurfaceType): void;
  setDistanceClimb(
    eventId: string,
    distanceKm: number | null,
    climbM: number | null,
  ): void;
}

export const useEventExtrasStore = create<EventExtrasState>()(
  persist(
    (set) => ({
      byEvent: {},

      setLevel(eventId, level) {
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: { ...(state.byEvent[eventId] ?? EMPTY_EXTRAS), level },
          },
        }));
      },

      setOrganizerGroup(eventId, name) {
        const trimmed = name.trim();
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: {
              ...(state.byEvent[eventId] ?? EMPTY_EXTRAS),
              organizerGroup: trimmed || null,
            },
          },
        }));
      },

      setTeam(eventId, teamId, teamName) {
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: {
              ...(state.byEvent[eventId] ?? EMPTY_EXTRAS),
              teamId,
              organizerGroup: teamName,
            },
          },
        }));
      },

      setActivityType(eventId, activityType) {
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: { ...(state.byEvent[eventId] ?? EMPTY_EXTRAS), activityType },
          },
        }));
      },

      setDistanceClimb(eventId, distanceKm, climbM) {
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: {
              ...(state.byEvent[eventId] ?? EMPTY_EXTRAS),
              distanceKm,
              climbM,
            },
          },
        }));
      },
    }),
    { name: "podium.eventExtras" },
  ),
);

export function getEventExtras(
  byEvent: Record<string, EventExtras>,
  eventId: string | null | undefined,
): EventExtras {
  return (eventId && byEvent[eventId]) || EMPTY_EXTRAS;
}
