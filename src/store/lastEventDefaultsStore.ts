// Remembers the last event an organizer created on EventCreatePage.tsx so the next "create new
// event" visit starts pre-filled with it instead of a blank form — asked for directly ("all
// data from my previous will auto fill again but i can change"). Deliberately excludes
// name/startsAt/description: those are per-event and copying them silently would be surprising
// (that's what the explicit "Copy track from an existing event" flow is for). Persisted to
// localStorage, same pattern as store/eventExtrasStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurfaceType } from "../lib/mock-tracks";
import type { RiderLevel } from "../lib/rider-level";

export interface LastEventDefaults {
  location: string;
  activityType: SurfaceType;
  level: RiderLevel | null;
  teamId: string;
  organizerGroup: string;
  visibility: "public" | "private";
  requiresApproval: boolean;
  ridersListVisible: boolean;
}

interface LastEventDefaultsState {
  defaults: LastEventDefaults | null;
  setDefaults(defaults: LastEventDefaults): void;
}

export const useLastEventDefaultsStore = create<LastEventDefaultsState>()(
  persist(
    (set) => ({
      defaults: null,
      setDefaults(defaults) {
        set({ defaults });
      },
    }),
    { name: "podium.lastEventDefaults" },
  ),
);
