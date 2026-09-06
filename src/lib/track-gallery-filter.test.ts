import { describe, expect, it } from "vitest";
import type { EventSummary } from "./local-db";
import {
  applyTrackGalleryCriteria,
  buildTrackGalleryQuery,
  DEFAULT_TRACK_GALLERY_CRITERIA,
  type TrackGalleryCriteria,
  trackGalleryActiveFilterCount,
} from "./track-gallery-filter";
import { CLIMB_MAX, DISTANCE_MAX, DISTANCE_MIN } from "./track-types";

function ev(over: Partial<EventSummary>): EventSummary {
  return {
    id: over.id ?? "e",
    code: "01012026A",
    name: "Ride",
    type: "RIDE",
    status: "published",
    visibility: "public",
    displayMode: "standard",
    startsAt: null,
    endsAt: null,
    location: null,
    ownerId: 1,
    ownerName: null,
    ownerAvatarUrl: null,
    ...over,
  } as EventSummary;
}

const crit = (over: Partial<TrackGalleryCriteria> = {}): TrackGalleryCriteria => ({
  ...DEFAULT_TRACK_GALLERY_CRITERIA,
  ...over,
});

describe("buildTrackGalleryQuery", () => {
  it("sends only sort when nothing is narrowed", () => {
    const p = buildTrackGalleryQuery(crit(), "newest", "  ");
    expect(p.get("sort")).toBe("newest");
    expect([...p.keys()].sort()).toEqual(["sort"]);
  });

  it("joins multi-selects as CSV and trims the search", () => {
    const p = buildTrackGalleryQuery(
      crit({ surface: ["road", "gravel"], level: ["elite"], areas: ["Galilee", "Negev"] }),
      "distance_asc",
      "  hills ",
    );
    expect(p.get("q")).toBe("hills");
    expect(p.get("sort")).toBe("distance_asc");
    expect(p.get("activityType")).toBe("road,gravel");
    expect(p.get("level")).toBe("elite");
    expect(p.get("areas")).toBe("Galilee,Negev");
  });

  it("omits a range at its extremes and includes it once moved", () => {
    const untouched = buildTrackGalleryQuery(crit(), "newest", "");
    expect(untouched.has("minDistanceKm")).toBe(false);
    expect(untouched.has("maxClimbM")).toBe(false);

    const moved = buildTrackGalleryQuery(
      crit({ distanceKm: [20, DISTANCE_MAX], climbM: [0, 800] }),
      "newest",
      "",
    );
    expect(moved.get("minDistanceKm")).toBe("20");
    expect(moved.has("maxDistanceKm")).toBe(false);
    expect(moved.get("maxClimbM")).toBe("800");
  });

  it("passes the duration buckets through", () => {
    const p = buildTrackGalleryQuery(crit({ durationBuckets: ["1to2", "gt5"] }), "newest", "");
    expect(p.get("durationBuckets")).toBe("1to2,gt5");
  });
});

describe("trackGalleryActiveFilterCount", () => {
  it("counts each value and each narrowed range once", () => {
    expect(trackGalleryActiveFilterCount(crit())).toBe(0);
    expect(
      trackGalleryActiveFilterCount(
        crit({
          areas: ["Galilee"],
          surface: ["road", "mtb"],
          durationBuckets: ["lt1"],
          distanceKm: [10, DISTANCE_MAX],
          climbM: [0, CLIMB_MAX],
        }),
      ),
    ).toBe(1 + 2 + 1 + 1);
  });
});

describe("applyTrackGalleryCriteria (My rides)", () => {
  const rows = [
    ev({
      id: "a",
      name: "Alps",
      area: "Galilee",
      activityType: "road",
      distanceKm: 30,
      durationMin: 90,
    }),
    ev({
      id: "b",
      name: "Beach",
      area: "Negev",
      activityType: "gravel",
      distanceKm: 120,
      durationMin: 240,
    }),
    ev({
      id: "c",
      name: "Carmel",
      area: "Galilee",
      activityType: "mtb",
      distanceKm: null,
      durationMin: null,
    }),
  ];

  it("filters by surface", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ surface: ["road"] }), "newest", "");
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("filters by area (exact)", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ areas: ["Galilee"] }), "name_asc", "");
    expect(out.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("drops rows with no distance when a distance bound is set", () => {
    const out = applyTrackGalleryCriteria(
      rows,
      crit({ distanceKm: [DISTANCE_MIN, 100] }),
      "newest",
      "",
    );
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("filters by duration bucket, excluding rows with no stated duration", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ durationBuckets: ["3to5"] }), "newest", "");
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });

  it("matches the search against name and area", () => {
    expect(applyTrackGalleryCriteria(rows, crit(), "newest", "carmel").map((e) => e.id)).toEqual([
      "c",
    ]);
    expect(applyTrackGalleryCriteria(rows, crit(), "newest", "negev").map((e) => e.id)).toEqual([
      "b",
    ]);
  });

  it("sorts by distance ascending with missing distances last", () => {
    const out = applyTrackGalleryCriteria(rows, crit(), "distance_asc", "");
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by name A–Z", () => {
    const out = applyTrackGalleryCriteria(rows, crit(), "name_asc", "");
    expect(out.map((e) => e.name)).toEqual(["Alps", "Beach", "Carmel"]);
  });
});
