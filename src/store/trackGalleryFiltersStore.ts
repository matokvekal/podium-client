// What the rider chose in the "Browse tracks" filter/sort sheets — kept out of the gallery
// component so a half-set filter survives closing the picker (and the whole create form)
// without being submitted. Modelled on trackFiltersStore.ts: zustand + persist to localStorage,
// with a clearFilters() reset.
//
// This is preference, not data — the fetched rides live in useTrackGallery. Persisted so the
// next ride an organizer builds opens with the same filters they last found useful.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_TRACK_GALLERY_CRITERIA,
  DEFAULT_TRACK_GALLERY_SORT,
  type TrackGalleryCriteria,
  type TrackGallerySort,
} from "../lib/track-gallery-filter";

interface TrackGalleryFiltersState {
  criteria: TrackGalleryCriteria;
  sort: TrackGallerySort;
  /** Merge a partial patch into the criteria — the sheet toggles one group at a time. */
  setCriteria(patch: Partial<TrackGalleryCriteria>): void;
  setSort(sort: TrackGallerySort): void;
  clearFilters(): void;
}

const VALID_SORTS: TrackGallerySort[] = [
  "newest",
  "oldest",
  "distance_asc",
  "distance_desc",
  "elevation_asc",
  "elevation_desc",
  "duration_asc",
  "duration_desc",
  "name_asc",
];

export const useTrackGalleryFiltersStore = create<TrackGalleryFiltersState>()(
  persist(
    (set) => ({
      criteria: DEFAULT_TRACK_GALLERY_CRITERIA,
      sort: DEFAULT_TRACK_GALLERY_SORT,
      setCriteria: (patch) => set((s) => ({ criteria: { ...s.criteria, ...patch } })),
      setSort: (sort) => set({ sort }),
      // Reset criteria only — the chosen sort order is a separate control with its own button
      // and its own "this is how I like the list" intent, so "Clear filters" leaves it be.
      clearFilters: () => set({ criteria: DEFAULT_TRACK_GALLERY_CRITERIA }),
    }),
    {
      name: "podium.trackGalleryFilters",
      version: 1,
      // A stored shape from a future/renamed version, or a stale sort key, falls back to
      // defaults rather than feeding the query builder something it cannot serialise.
      migrate: (persisted, version) => {
        if (version !== 1) {
          return {
            criteria: DEFAULT_TRACK_GALLERY_CRITERIA,
            sort: DEFAULT_TRACK_GALLERY_SORT,
          };
        }
        const state = persisted as Partial<TrackGalleryFiltersState>;
        return {
          criteria: { ...DEFAULT_TRACK_GALLERY_CRITERIA, ...(state.criteria ?? {}) },
          sort: VALID_SORTS.includes(state.sort as TrackGallerySort)
            ? (state.sort as TrackGallerySort)
            : DEFAULT_TRACK_GALLERY_SORT,
        };
      },
      partialize: (state) => ({ criteria: state.criteria, sort: state.sort }),
    },
  ),
);
