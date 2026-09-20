import { describe, expect, it } from "vitest";
import {
  asRouteDifficulty,
  asTrailSeason,
  asTrailShade,
  ROUTE_DIFFICULTIES,
  ROUTE_DIFFICULTY_LABEL,
  TRAIL_SEASON_LABEL,
  TRAIL_SEASONS,
  TRAIL_SHADE_LABEL,
  TRAIL_SHADES,
  trailMetadataApplies,
} from "./trail-metadata";

describe("trail metadata vocabulary", () => {
  it("has a Hebrew label for every key, and only for those keys", () => {
    expect(Object.keys(ROUTE_DIFFICULTY_LABEL).sort()).toEqual([...ROUTE_DIFFICULTIES].sort());
    expect(Object.keys(TRAIL_SEASON_LABEL).sort()).toEqual([...TRAIL_SEASONS].sort());
    expect(Object.keys(TRAIL_SHADE_LABEL).sort()).toEqual([...TRAIL_SHADES].sort());
  });

  it("uses the labels the curated library carries", () => {
    expect(ROUTE_DIFFICULTY_LABEL).toEqual({
      easy: "קל",
      moderate: "בינוני",
      hard: "קשה",
      challenging: "אתגרי",
    });
    expect(TRAIL_SEASON_LABEL.spring_autumn).toBe("אביב–סתיו");
    expect(TRAIL_SEASON_LABEL.winter_spring).toBe("חורף–אביב");
    expect(TRAIL_SHADE_LABEL.exposed).toBe("חשוף לשמש");
  });

  it("applies to mtb and gravel only, and never to an unstated discipline", () => {
    expect(trailMetadataApplies("mtb")).toBe(true);
    expect(trailMetadataApplies("gravel")).toBe(true);
    expect(trailMetadataApplies("road")).toBe(false);
    expect(trailMetadataApplies("running")).toBe(false);
    expect(trailMetadataApplies(null)).toBe(false);
    expect(trailMetadataApplies(undefined)).toBe(false);
  });

  it("narrows server values and drops anything unknown", () => {
    expect(asRouteDifficulty("hard")).toBe("hard");
    expect(asRouteDifficulty("קשה")).toBeNull();
    expect(asTrailSeason("spring_autumn")).toBe("spring_autumn");
    expect(asTrailSeason("summer")).toBeNull();
    expect(asTrailShade("partial")).toBe("partial");
    expect(asTrailShade(null)).toBeNull();
    expect(asTrailShade(3)).toBeNull();
  });
});
