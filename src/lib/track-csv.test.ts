// End-to-end cover for "an uploaded track keeps its elevation series", through the half of the
// upload path that can actually be tested here: parseTrackCsv is pure string work, while its
// sibling parseTrackGpx needs DOMParser and this repo deliberately has no jsdom (see
// lib/image-processing.test.ts). Both parsers return the same ParsedTrack contract and share
// elevationSeriesOrNull, so what is asserted below is the shape the profile is drawn from.

import { describe, expect, it } from "vitest";
import { buildElevationProfile } from "./elevation-profile";
import { parseTrackCsv } from "./track-csv";

const WITH_ELEVATION = [
  "lat,lon,ele",
  "32.000,34.800,40",
  "32.001,34.800,65",
  "32.002,34.800,120",
  "32.003,34.800,95",
].join("\n");

const WITHOUT_ELEVATION = ["lat,lon", "32.000,34.800", "32.001,34.800", "32.002,34.800"].join("\n");

describe("parseTrackCsv elevation series", () => {
  it("keeps one elevation per point, alongside the total climb", () => {
    const parsed = parseTrackCsv(WITH_ELEVATION);

    expect(parsed?.points).toHaveLength(4);
    expect(parsed?.elevations).toEqual([40, 65, 120, 95]);
    // The existing climb figure is untouched by the series riding alongside it.
    expect(parsed?.elevationGainM).toBe(80);
  });

  it("reports no series at all for a file without elevation", () => {
    const parsed = parseTrackCsv(WITHOUT_ELEVATION);

    expect(parsed?.points).toHaveLength(3);
    expect(parsed?.elevations).toBeNull();
    expect(parsed?.elevationGainM).toBeNull();
  });

  it("leaves a gap where one row has no readable elevation", () => {
    const parsed = parseTrackCsv(
      ["lat,lon,ele", "32.000,34.800,40", "32.001,34.800,", "32.002,34.800,120"].join("\n"),
    );

    expect(parsed?.elevations).toEqual([40, null, 120]);
  });

  it("stays aligned with the points when a row is dropped as unusable", () => {
    const parsed = parseTrackCsv(
      ["lat,lon,ele", "32.000,34.800,40", "not-a-number,34.800,999", "32.002,34.800,120"].join(
        "\n",
      ),
    );

    expect(parsed?.points).toHaveLength(2);
    expect(parsed?.elevations).toHaveLength(2);
    expect(parsed?.elevations).toEqual([40, 120]);
  });
});

describe("an uploaded track through to a drawable profile", () => {
  it("produces a profile with real distances", () => {
    const parsed = parseTrackCsv(WITH_ELEVATION);
    const profile = buildElevationProfile(parsed?.points, parsed?.elevations);

    expect(profile).not.toBeNull();
    expect(profile?.samples).toHaveLength(4);
    expect(profile?.minM).toBe(40);
    expect(profile?.maxM).toBe(120);
    expect(profile?.samples[0].distanceKm).toBe(0);
    expect(profile?.totalKm).toBeGreaterThan(0);
  });

  it("produces nothing at all for a track with no elevation", () => {
    const parsed = parseTrackCsv(WITHOUT_ELEVATION);

    expect(buildElevationProfile(parsed?.points, parsed?.elevations)).toBeNull();
  });
});
