// Ride groups (e.g. "Elite" / "Masters") — a club or team riding an event together as 2-4
// separate groups at the same time, each optionally on its own track. Not about placing or
// competing between groups, just organizing who's riding what — see EventGroupsCard.tsx's doc
// comment for the full picture. No server field or endpoint exists for this at all yet (unlike
// participants, this isn't even in plan/07-api-contract.md) — persisted to localStorage, keyed
// by event id, same pattern as participantsStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventRoute } from "../lib/event-route";

export interface EventGroup {
  id: string;
  name: string;
  /** Independent of the event's own startsAt — a club can run "Elite" at 06:00 and "Masters"
   * at 07:00 off the same event. ISO, UTC — see lib/time.ts for display conversion. */
  startsAt: string | null;
  /** Set only if this group copied a track from another event (its real saved route). */
  route: EventRoute | null;
  copiedFromName: string | null;
}

interface EventGroupsState {
  byEvent: Record<string, EventGroup[]>;
  addGroup(eventId: string, name: string): void;
  renameGroup(eventId: string, id: string, name: string): void;
  setGroupStartsAt(eventId: string, id: string, startsAt: string | null): void;
  removeGroup(eventId: string, id: string): void;
  setGroupTrack(eventId: string, id: string, route: EventRoute, copiedFromName: string): void;
  clearGroupTrack(eventId: string, id: string): void;
}

const MAX_GROUPS = 4;

let localId = 0;

function mapEvent(
  byEvent: Record<string, EventGroup[]>,
  eventId: string,
  fn: (list: EventGroup[]) => EventGroup[],
): Record<string, EventGroup[]> {
  const list = byEvent[eventId] ?? [];
  return { ...byEvent, [eventId]: fn(list) };
}

export const useEventGroupsStore = create<EventGroupsState>()(
  persist(
    (set) => ({
      byEvent: {},

      addGroup(eventId, name) {
        set((state) => {
          const existing = state.byEvent[eventId] ?? [];
          if (existing.length >= MAX_GROUPS) return state;
          const group: EventGroup = {
            id: `group-${++localId}`,
            name: name.trim() || `Group ${existing.length + 1}`,
            startsAt: null,
            route: null,
            copiedFromName: null,
          };
          return mapEvent(state.byEvent, eventId, (list) => [...list, group]);
        });
      },

      renameGroup(eventId, id, name) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)),
          ),
        }));
      },

      setGroupStartsAt(eventId, id, startsAt) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((g) => (g.id === id ? { ...g, startsAt } : g)),
          ),
        }));
      },

      removeGroup(eventId, id) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) => list.filter((g) => g.id !== id)),
        }));
      },

      setGroupTrack(eventId, id, route, copiedFromName) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((g) => (g.id === id ? { ...g, route, copiedFromName } : g)),
          ),
        }));
      },

      clearGroupTrack(eventId, id) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((g) => (g.id === id ? { ...g, route: null, copiedFromName: null } : g)),
          ),
        }));
      },
    }),
    { name: "podium.eventGroups" },
  ),
);

export { MAX_GROUPS };
