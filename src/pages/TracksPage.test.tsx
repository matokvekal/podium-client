/**
 * @vitest-environment jsdom
 */

// Find Tracks' address bar. The link is the product here (/findtracks/il/mtb is what gets pasted
// into Facebook), so the three ways it can go wrong are pinned:
//
//   1. OPENING a link applies its country and discipline — over whatever the visitor had saved.
//   2. CHANGING a filter rewrites the link, so a copied address always reopens what is on screen.
//   3. TWO DISCIPLINES don't fight the URL: it names the country only, and the address change
//      must not answer by clearing the second discipline.
//
// The gallery's data hook is stubbed — nothing here reaches the network — and the real filter
// store is used, because the store is what the URL has to agree with.

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/useTrackGallery", () => ({
  useTrackGallery: () => ({
    rides: [],
    total: 0,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: () => {},
  }),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-out", profile: null }),
}));

const { TracksPage } = await import("./TracksPage");
const { useTrackGalleryFiltersStore } = await import("../store/trackGalleryFiltersStore");
const { DEFAULT_TRACK_GALLERY_CRITERIA } = await import("../lib/track-gallery-filter");

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/findtracks/*" element={<TracksPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const where = () => screen.getByTestId("where").textContent;
const criteria = () => useTrackGalleryFiltersStore.getState().criteria;
// The quick row comes first in the DOM; the Filter panel repeats the same words further down.
const quick = (name: string) => screen.getAllByRole("button", { name })[0];

beforeEach(() => {
  useTrackGalleryFiltersStore.setState({
    criteria: { ...DEFAULT_TRACK_GALLERY_CRITERIA, country: "US", surface: ["road"] },
    countrySeeded: true,
  });
});

describe("Find Tracks address bar", () => {
  it("applies the link's country and discipline over the visitor's saved ones", () => {
    renderAt("/findtracks/il/mtb");
    expect(criteria().country).toBe("IL");
    expect(criteria().surface).toEqual(["mtb"]);
    expect(where()).toBe("/findtracks/il/mtb");
    expect(document.title).toBe("MTB tracks in Israel · El Niño Ride");
  });

  it("reads 'all' as any country", () => {
    renderAt("/findtracks/all/gravel");
    expect(criteria().country).toBeNull();
    expect(criteria().surface).toEqual(["gravel"]);
  });

  it("redirects a non-canonical spelling and an unknown segment", () => {
    renderAt("/findtracks/IL/MTB");
    expect(where()).toBe("/findtracks/il/mtb");
  });

  it("drops an unknown segment back to the valid prefix", () => {
    renderAt("/findtracks/il/skateboard");
    expect(where()).toBe("/findtracks/il");
  });

  it("leaves the visitor's own filters alone on the bare page", () => {
    renderAt("/findtracks");
    expect(where()).toBe("/findtracks");
    expect(criteria().country).toBe("US");
    expect(criteria().surface).toEqual(["road"]);
  });

  it("rewrites the link when the discipline changes", () => {
    renderAt("/findtracks/il");
    fireEvent.click(quick("MTB"));
    expect(where()).toBe("/findtracks/il/mtb");
    fireEvent.click(quick("MTB"));
    expect(where()).toBe("/findtracks/il");
  });

  it("keeps two disciplines: the link names the country only", () => {
    renderAt("/findtracks/il/mtb");
    fireEvent.click(quick("Road"));
    expect(where()).toBe("/findtracks/il");
    expect(criteria().surface.sort()).toEqual(["mtb", "road"]);
  });
});
