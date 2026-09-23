/** @vitest-environment jsdom */
// Find Tracks' Road / Gravel / MTB row: MTB for a rider with no choice yet, and whatever they
// pick is what the next visit restores (it rides in the persisted criteria).

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TRACK_GALLERY_CRITERIA } from "../lib/track-gallery-filter";
import { useTrackGalleryFiltersStore } from "./trackGalleryFiltersStore";

const STORAGE_KEY = "podium.trackGalleryFilters";

beforeEach(() => {
  localStorage.clear();
  useTrackGalleryFiltersStore.setState({
    criteria: DEFAULT_TRACK_GALLERY_CRITERIA,
    countrySeeded: false,
    surfaceSeeded: false,
  });
});

describe("seedSurface", () => {
  it("defaults a rider with no previous choice to MTB", () => {
    useTrackGalleryFiltersStore.getState().seedSurface();
    expect(useTrackGalleryFiltersStore.getState().criteria.surface).toEqual(["mtb"]);
  });

  it("keeps a choice the rider already has", () => {
    useTrackGalleryFiltersStore.getState().setCriteria({ surface: ["road"] });
    useTrackGalleryFiltersStore.getState().seedSurface();
    expect(useTrackGalleryFiltersStore.getState().criteria.surface).toEqual(["road"]);
  });

  it("runs once — clearing the row afterwards is respected on the next visit", () => {
    const store = useTrackGalleryFiltersStore.getState();
    store.seedSurface();
    store.setCriteria({ surface: [] });
    useTrackGalleryFiltersStore.getState().seedSurface();
    expect(useTrackGalleryFiltersStore.getState().criteria.surface).toEqual([]);
  });
});

describe("persistence", () => {
  it("writes the selected terrain to localStorage so the next visit restores it", () => {
    useTrackGalleryFiltersStore.getState().seedSurface();
    useTrackGalleryFiltersStore.getState().setCriteria({ surface: ["gravel"] });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.state.criteria.surface).toEqual(["gravel"]);
    expect(saved.state.surfaceSeeded).toBe(true);
  });
});
