// Find Tracks' filter/preference state — separate from tracksStore.ts (which holds the
// fetched track *data*) because this is what the rider chose, not what came back from the
// server. Persisted to localStorage via zustand's own persist middleware, so filters survive
// a reload — "for next time", as asked — with a clearFilters() action to reset to defaults.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CLIMB_MAX, CLIMB_MIN, DISTANCE_MAX, DISTANCE_MIN, type RouteType } from "../lib/track-types";

// Trimmed to the filters GET /routes/public actually accepts, plus favoritesOnly (a purely
// client-side pass over the fetched page — favourites have no server column).
//
// Removed, because no route field exists to filter on and a control that silently does nothing
// is worse than no control: countryCode, multiDayOnly, avoidBusyRoads, dayOfWeek, showHazards,
// showPois. surfaceType became routeType — the library's own road|gravel|mtb|mixed taxonomy,
// which is what the endpoint validates against.
interface TrackFiltersState {
  location: string;
  routeType: RouteType | null;
  distanceRange: [number, number];
  climbRange: [number, number];
  favoritesOnly: boolean;
  setLocation(value: string): void;
  setRouteType(value: RouteType | null): void;
  setDistanceRange(value: [number, number]): void;
  setClimbRange(value: [number, number]): void;
  setFavoritesOnly(value: boolean): void;
  clearFilters(): void;
}

// Used only to sanitize what a returning rider already has in localStorage (see the persist
// `migrate` below) — a stored "running" or "hiking" from the old surface filter is not a valid
// route type and would be rejected by the endpoint.
const VALID_ROUTE_TYPES: RouteType[] = ["road", "gravel", "mtb", "mixed"];

// routeType defaults to null — "any type". The old default was "road", which silently hid every
// gravel and MTB route in the library from a rider who never opened the filter.
const DEFAULTS = {
  location: "",
  routeType: null as RouteType | null,
  distanceRange: [DISTANCE_MIN, DISTANCE_MAX] as [number, number],
  climbRange: [CLIMB_MIN, CLIMB_MAX] as [number, number],
  favoritesOnly: false,
};

export const useTrackFiltersStore = create<TrackFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setLocation: (location) => set({ location }),
      setRouteType: (routeType) => set({ routeType }),
      setDistanceRange: (distanceRange) => set({ distanceRange }),
      setClimbRange: (climbRange) => set({ climbRange }),
      setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
      clearFilters: () => set(DEFAULTS),
    }),
    {
      name: "podium.trackFilters",
      // Bumped to 2 with the move to real route data. A rider who used Find Tracks before this
      // has a stored surfaceType (possibly "running"/"hiking"/"walking") and a countryCode, and
      // neither is a thing the route endpoint accepts. Version 1's migrate repaired a renamed
      // surface value in place; there is nothing to repair now, because the field it repaired
      // no longer exists.
      //
      // Anything stored under the old shape is dropped and replaced with DEFAULTS. That is
      // deliberate rather than a best-effort carry-over: a stale "road" surface silently became
      // a route-type filter that hid every gravel and MTB route in the library, which is
      // exactly the kind of invisible empty-list bug this whole pass is about.
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) return { ...DEFAULTS };
        const state = persisted as Partial<typeof DEFAULTS>;
        return {
          ...DEFAULTS,
          ...state,
          routeType: VALID_ROUTE_TYPES.includes(state.routeType as RouteType)
            ? (state.routeType as RouteType)
            : DEFAULTS.routeType,
        };
      },
      // Only the actual filter values persist — the action functions aren't serializable
      // and are re-attached fresh by `create` on every load anyway.
      partialize: (state) => ({
        location: state.location,
        routeType: state.routeType,
        distanceRange: state.distanceRange,
        climbRange: state.climbRange,
        favoritesOnly: state.favoritesOnly,
      }),
    },
  ),
);
