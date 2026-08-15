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
  /** "Open for all, but I still approve each rider" — see the doc comment on
   * EventCreatePage.tsx's `requiresApproval` state for why this is preview-only for now: the
   * server doesn't yet default self-joiners to `waiting_approval`, so this flag has nothing to
   * enforce it yet. */
  requiresApproval: boolean;
  /** Links this event into a team's shared schedule (store/teamsStore.ts) — distinct from
   * organizerGroup, which is just the display string. Set together via setTeam() when the
   * organizer picks a team on EventCreatePage.tsx, so organizerGroup always mirrors the
   * team's current name without a second lookup everywhere it's shown. */
  teamId: string | null;
  /** Same "shown, then forgotten" story as everywhere else — but EventCreatePage.tsx's edit
   * mode needs to read it back to prefill the form, so it's persisted here now too. */
  activityType: SurfaceType | null;
}

const EMPTY_EXTRAS: EventExtras = {
  level: null,
  organizerGroup: null,
  requiresApproval: false,
  teamId: null,
  activityType: null,
};

interface EventExtrasState {
  byEvent: Record<string, EventExtras>;
  setLevel(eventId: string, level: RiderLevel | null): void;
  setOrganizerGroup(eventId: string, name: string): void;
  setRequiresApproval(eventId: string, value: boolean): void;
  setTeam(eventId: string, teamId: string | null, teamName: string | null): void;
  setActivityType(eventId: string, activityType: SurfaceType): void;
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

      setRequiresApproval(eventId, value) {
        set((state) => ({
          byEvent: {
            ...state.byEvent,
            [eventId]: { ...(state.byEvent[eventId] ?? EMPTY_EXTRAS), requiresApproval: value },
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
