// Find Tracks' filter/preference state — separate from tracksStore.ts (which holds the
// fetched track *data*) because this is what the rider chose, not what came back from the
// server. Persisted to localStorage via zustand's own persist middleware, so filters survive
// a reload — "for next time", as asked — with a clearFilters() action to reset to defaults.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SurfaceType } from "../lib/surface-types";
import { CLIMB_MAX, CLIMB_MIN, DISTANCE_MAX, DISTANCE_MIN } from "../lib/track-types";

interface TrackFiltersState {
  location: string;
  countryCode: string;
  surfaceType: SurfaceType;
  distanceRange: [number, number];
  climbRange: [number, number];
  multiDayOnly: boolean;
  avoidBusyRoads: boolean;
  dayOfWeek: number | null;
  favoritesOnly: boolean;
  showHazards: boolean;
  showPois: boolean;
  setLocation(value: string): void;
  setCountryCode(value: string): void;
  setSurfaceType(value: SurfaceType): void;
  setDistanceRange(value: [number, number]): void;
  setClimbRange(value: [number, number]): void;
  setMultiDayOnly(value: boolean): void;
  setAvoidBusyRoads(value: boolean): void;
  setDayOfWeek(value: number | null): void;
  setFavoritesOnly(value: boolean): void;
  setShowHazards(value: boolean): void;
  setShowPois(value: boolean): void;
  clearFilters(): void;
}

// Kept in sync by hand with surface-types.ts's SurfaceType union and TracksPage.tsx's
// COUNTRY_FILTERS — used only to sanitize whatever a returning rider already has in
// localStorage (see the persist `migrate` below), not as a source of truth elsewhere.
const VALID_SURFACE_TYPES: SurfaceType[] = ["road", "gravel", "mtb", "running", "hiking"];
const VALID_COUNTRY_CODES = ["IL", "GB", "ES", "IT", "FR"];

const DEFAULTS = {
  location: "",
  countryCode: "IL",
  surfaceType: "road" as SurfaceType,
  distanceRange: [DISTANCE_MIN, DISTANCE_MAX] as [number, number],
  climbRange: [CLIMB_MIN, CLIMB_MAX] as [number, number],
  multiDayOnly: false,
  avoidBusyRoads: false,
  dayOfWeek: null as number | null,
  favoritesOnly: false,
  showHazards: true,
  showPois: true,
};

export const useTrackFiltersStore = create<TrackFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setLocation: (location) => set({ location }),
      setCountryCode: (countryCode) => set({ countryCode }),
      setSurfaceType: (surfaceType) => set({ surfaceType }),
      setDistanceRange: (distanceRange) => set({ distanceRange }),
      setClimbRange: (climbRange) => set({ climbRange }),
      setMultiDayOnly: (multiDayOnly) => set({ multiDayOnly }),
      setAvoidBusyRoads: (avoidBusyRoads) => set({ avoidBusyRoads }),
      setDayOfWeek: (dayOfWeek) => set({ dayOfWeek }),
      setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
      setShowHazards: (showHazards) => set({ showHazards }),
      setShowPois: (showPois) => set({ showPois }),
      clearFilters: () => set(DEFAULTS),
    }),
    {
      name: "podium.trackFilters",
      // Bumped once: an earlier build persisted surfaceType "walking", later renamed to
      // "hiking" (see surface-types.ts). Without this, a rider who opened Find Tracks before
      // that rename gets stuck on a surface value no track can ever match again — an
      // empty-forever result list with no visible error. `migrate` below repairs that stored
      // value in place instead of silently discarding the rest of their saved filters.
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<typeof DEFAULTS>;
        return {
          ...DEFAULTS,
          ...state,
          surfaceType: VALID_SURFACE_TYPES.includes(state.surfaceType as SurfaceType)
            ? (state.surfaceType as SurfaceType)
            : DEFAULTS.surfaceType,
          countryCode: VALID_COUNTRY_CODES.includes(state.countryCode as string)
            ? (state.countryCode as string)
            : DEFAULTS.countryCode,
        };
      },
      // Only the actual filter values persist — the action functions aren't serializable
      // and are re-attached fresh by `create` on every load anyway.
      partialize: (state) => ({
        location: state.location,
        countryCode: state.countryCode,
        surfaceType: state.surfaceType,
        distanceRange: state.distanceRange,
        climbRange: state.climbRange,
        multiDayOnly: state.multiDayOnly,
        avoidBusyRoads: state.avoidBusyRoads,
        dayOfWeek: state.dayOfWeek,
        favoritesOnly: state.favoritesOnly,
        showHazards: state.showHazards,
        showPois: state.showPois,
      }),
    },
  ),
);
