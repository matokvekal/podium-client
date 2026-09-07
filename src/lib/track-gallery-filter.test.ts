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
  it("always sends sort + uniqueTracks, nothing else when unnarrowed", () => {
    const p = buildTrackGalleryQuery(crit(), "newest", "  ");
    expect(p.get("sort")).toBe("newest");
    expect(p.get("uniqueTracks")).toBe("1");
    expect([...p.keys()].sort()).toEqual(["sort", "uniqueTracks"]);
  });

  it("emits country, region, surface CSV and trims the search", () => {
    const p = buildTrackGalleryQuery(
      crit({ country: "IL", region: "north", surface: ["road", "gravel"] }),
      "distance_asc",
      "  hills ",
    );
    expect(p.get("q")).toBe("hills");
    expect(p.get("sort")).toBe("distance_asc");
    expect(p.get("country")).toBe("IL");
    expect(p.get("region")).toBe("north");
    expect(p.get("activityType")).toBe("road,gravel");
  });

  it("omits country / region when null", () => {
    const p = buildTrackGalleryQuery(crit({ country: null, region: null }), "newest", "");
    expect(p.has("country")).toBe(false);
    expect(p.has("region")).toBe(false);
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
  it("does not count country when it equals the rider default", () => {
    expect(trackGalleryActiveFilterCount(crit({ country: "IL" }), "IL")).toBe(0);
  });

  it("counts a changed country, a widened country, and every other filter", () => {
    expect(
      trackGalleryActiveFilterCount(
        crit({
          country: null, // widened away from "IL"
          region: "north",
          surface: ["road", "mtb"],
          durationBuckets: ["lt1"],
          distanceKm: [10, DISTANCE_MAX],
          climbM: [0, CLIMB_MAX],
        }),
        "IL",
      ),
    ).toBe(1 + 1 + 2 + 1 + 1);
  });
});

describe("applyTrackGalleryCriteria (My rides)", () => {
  const rows = [
    ev({
      id: "a",
      name: "Alps",
      country: "IL",
      region: "north",
      activityType: "road",
      distanceKm: 30,
      durationMin: 90,
      downloads: 2,
    }),
    ev({
      id: "b",
      name: "Beach",
      country: "IL",
      region: "negev",
      activityType: "gravel",
      distanceKm: 120,
      durationMin: 240,
      downloads: 9,
    }),
    ev({
      id: "c",
      name: "Carmel",
      country: "US",
      region: "north",
      activityType: "mtb",
      distanceKm: null,
      durationMin: null,
      downloads: null,
    }),
  ];

  it("filters by surface", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ surface: ["road"] }), "newest", "");
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("filters by country", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ country: "IL" }), "name_asc", "");
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("filters by region", () => {
    const out = applyTrackGalleryCriteria(rows, crit({ region: "north" }), "name_asc", "");
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

  it("matches the search against name", () => {
    expect(applyTrackGalleryCriteria(rows, crit(), "newest", "carmel").map((e) => e.id)).toEqual([
      "c",
    ]);
  });

  it("sorts by distance ascending with missing distances last", () => {
    const out = applyTrackGalleryCriteria(rows, crit(), "distance_asc", "");
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by downloads (most used first), nulls last", () => {
    const out = applyTrackGalleryCriteria(rows, crit(), "downloads_desc", "");
    expect(out.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by name A–Z", () => {
    const out = applyTrackGalleryCriteria(rows, crit(), "name_asc", "");
    expect(out.map((e) => e.name)).toEqual(["Alps", "Beach", "Carmel"]);
  });
});
