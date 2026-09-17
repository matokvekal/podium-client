// The terrain vocabulary.
//
// The point of this file is that the NUMBER is portable and the WORDS are not: grade 3 must
// read "S3" on an MTB ride and "G3" on a gravel ride, from one stored SMALLINT. If those ever
// collapse into one label set, a gravel rider gets told their ride is singletrack.

import { describe, expect, it } from "vitest";
import {
  asTerrainGrade,
  type TerrainGrade,
  terrainApplies,
  terrainDescriptionFor,
  terrainLabelFor,
  terrainOptionsFor,
  terrainScaleNameFor,
} from "./terrain-grade";

describe("terrainApplies — which rides have a grade", () => {
  it("is true for mtb and gravel", () => {
    expect(terrainApplies("mtb")).toBe(true);
    expect(terrainApplies("gravel")).toBe(true);
  });

  it("is false for road — the surface is the road", () => {
    expect(terrainApplies("road")).toBe(false);
  });

  it("is false for running and hiking, which have their own scales this app does not model", () => {
    expect(terrainApplies("running")).toBe(false);
    expect(terrainApplies("hiking")).toBe(false);
  });

  it("is false when the discipline is unknown — there is no scale to read the number against", () => {
    expect(terrainApplies(null)).toBe(false);
    expect(terrainApplies(undefined)).toBe(false);
  });
});

describe("terrainLabelFor — one number, two vocabularies", () => {
  it("⚠ reads grade 3 as S3 on MTB and G3 on gravel", () => {
    expect(terrainLabelFor(3, "mtb")).toBe("S3");
    expect(terrainLabelFor(3, "gravel")).toBe("G3");
  });

  it("labels every grade on both scales, with no gaps", () => {
    for (const grade of [1, 2, 3, 4, 5] as TerrainGrade[]) {
      expect(terrainLabelFor(grade, "mtb")).toBe(`S${grade}`);
      expect(terrainLabelFor(grade, "gravel")).toBe(`G${grade}`);
    }
  });

  it("falls back to the MTB scale for an unstated discipline rather than rendering nothing", () => {
    // terrainApplies() gates DISPLAY; if a caller asks anyway it must still get a string.
    expect(terrainLabelFor(2, null)).toBe("S2");
  });
});

describe("terrainDescriptionFor — what the ground actually is", () => {
  it("describes the terrain, not the difficulty", () => {
    expect(terrainDescriptionFor(1, "mtb").toLowerCase()).toContain("hardpack");
    expect(terrainDescriptionFor(4, "gravel").toLowerCase()).toContain("sand");
  });

  it("names a tyre width where that is the deciding fact for a gravel rider", () => {
    expect(terrainDescriptionFor(1, "gravel")).toMatch(/32mm/);
    expect(terrainDescriptionFor(3, "gravel")).toMatch(/40mm/);
  });

  it("has a distinct description for every grade on each scale", () => {
    for (const surface of ["mtb", "gravel"] as const) {
      const all = ([1, 2, 3, 4, 5] as TerrainGrade[]).map((g) => terrainDescriptionFor(g, surface));
      expect(new Set(all).size).toBe(5);
      expect(all.every((text) => text.length > 0)).toBe(true);
    }
  });
});

describe("terrainOptionsFor — the picker", () => {
  it("offers five options in ascending order", () => {
    const options = terrainOptionsFor("mtb");
    expect(options.map((o) => o.grade)).toEqual([1, 2, 3, 4, 5]);
  });

  it("carries both the badge and the description, so the form needs no second lookup", () => {
    const [first] = terrainOptionsFor("gravel");
    expect(first.label).toBe("G1");
    expect(first.terrain.length).toBeGreaterThan(0);
  });
});

describe("terrainScaleNameFor", () => {
  it("names the real scale per discipline", () => {
    expect(terrainScaleNameFor("mtb")).toMatch(/singletrail/i);
    expect(terrainScaleNameFor("gravel")).toMatch(/surface/i);
  });
});

describe("asTerrainGrade — narrowing whatever the API sent", () => {
  it("passes 1 through 5", () => {
    for (const grade of [1, 2, 3, 4, 5]) expect(asTerrainGrade(grade)).toBe(grade);
  });

  it("rejects out-of-range values rather than rendering a label that does not exist", () => {
    expect(asTerrainGrade(0)).toBeNull();
    expect(asTerrainGrade(6)).toBeNull();
    expect(asTerrainGrade(-1)).toBeNull();
  });

  it("rejects a fraction", () => {
    expect(asTerrainGrade(2.5)).toBeNull();
  });

  it("reads null / undefined as 'not stated'", () => {
    expect(asTerrainGrade(null)).toBeNull();
    expect(asTerrainGrade(undefined)).toBeNull();
  });
});
