// What the rider chose in the "Browse tracks" filter/sort sheets — kept out of the gallery
// component so a half-set filter survives closing the picker (and the whole create form)
// without being submitted. Modelled on trackFiltersStore.ts: zustand + persist to localStorage.
//
// This is preference, not data — the fetched rides live in useTrackGallery. Persisted so the
// next ride an organizer builds opens with the same filters they last found useful.
//
// COUNTRY is seeded once from the rider's profile country (seedCountry, called by the sheet on
// mount) — an Israeli opens the picker scoped to Israel without touching anything, and can
// widen to "Any country". `countrySeeded` marks that the seed has run so it never overrides a
// choice the rider made and persisted.

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
  countrySeeded: boolean;
  /** Merge a partial patch into the criteria — the sheet toggles one group at a time. */
  setCriteria(patch: Partial<TrackGalleryCriteria>): void;
  setSort(sort: TrackGallerySort): void;
  /** Set the country ONCE, before the rider has touched the filter (idempotent after). */
  seedCountry(code: string | null): void;
  /** Reset the filters, but keep the country on the rider's default rather than "Any". */
  clearFilters(defaultCountry: string | null): void;
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
  "downloads_desc",
  "downloads_asc",
  "name_asc",
];

const cleanSort = (sort: unknown): TrackGallerySort =>
  VALID_SORTS.includes(sort as TrackGallerySort)
    ? (sort as TrackGallerySort)
    : DEFAULT_TRACK_GALLERY_SORT;

export const useTrackGalleryFiltersStore = create<TrackGalleryFiltersState>()(
  persist(
    (set) => ({
      criteria: DEFAULT_TRACK_GALLERY_CRITERIA,
      sort: DEFAULT_TRACK_GALLERY_SORT,
      countrySeeded: false,
      setCriteria: (patch) => set((s) => ({ criteria: { ...s.criteria, ...patch } })),
      setSort: (sort) => set({ sort }),
      seedCountry: (code) =>
        set((s) =>
          s.countrySeeded ? s : { criteria: { ...s.criteria, country: code }, countrySeeded: true },
        ),
      // Reset criteria only — the chosen sort is a separate control ("this is how I like the
      // list"), so "Clear filters" leaves it be. Country goes back to the rider's default, not
      // to "Any": clearing filters shouldn't dump them into every country.
      clearFilters: (defaultCountry) =>
        set({ criteria: { ...DEFAULT_TRACK_GALLERY_CRITERIA, country: defaultCountry } }),
    }),
    {
      name: "podium.trackGalleryFilters",
      // Bumped to 2 with the shift from a free-text area multi-select + a Difficulty filter to
      // a country + region model. A v1 stored `areas`/`level` are dropped rather than mapped —
      // there is no clean carry-over, and a stale key would break the query builder.
      version: 2,
      migrate: (persisted, version) => {
        if (version !== 2) {
          const state = persisted as { sort?: unknown } | undefined;
          return {
            criteria: DEFAULT_TRACK_GALLERY_CRITERIA,
            sort: cleanSort(state?.sort),
            countrySeeded: false,
          };
        }
        const state = persisted as Partial<TrackGalleryFiltersState>;
        return {
          criteria: { ...DEFAULT_TRACK_GALLERY_CRITERIA, ...(state.criteria ?? {}) },
          sort: cleanSort(state.sort),
          countrySeeded: state.countrySeeded ?? false,
        };
      },
      partialize: (state) => ({
        criteria: state.criteria,
        sort: state.sort,
        countrySeeded: state.countrySeeded,
      }),
    },
  ),
);
