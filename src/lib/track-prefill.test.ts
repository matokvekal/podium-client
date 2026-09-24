import { describe, expect, it } from "vitest";
import { trackCountry, trackFieldLocks } from "./track-prefill";

describe("trackFieldLocks", () => {
  it("locks nothing without a known track (upload, or no track yet)", () => {
    expect(trackFieldLocks(null)).toEqual({ hideTerrain: false, hideCountry: false });
  });

  it("hides terrain and country when the track carries both", () => {
    expect(trackFieldLocks({ name: "Carmel loop", country: "IL", activityType: "mtb" })).toEqual({
      hideTerrain: true,
      hideCountry: true,
    });
  });

  it("keeps the Country field for an old track with no country", () => {
    expect(trackFieldLocks({ name: "Old", country: null, activityType: "road" })).toEqual({
      hideTerrain: true,
      hideCountry: false,
    });
  });

  it("keeps the Terrain field for a track with no discipline", () => {
    expect(trackFieldLocks({ name: "x", country: "SE", activityType: null }).hideTerrain).toBe(
      false,
    );
  });
});

describe("trackCountry", () => {
  it("normalises a known code", () => {
    expect(trackCountry("il")).toBe("IL");
  });

  it("treats a missing or unknown code as missing", () => {
    expect(trackCountry(null)).toBeNull();
    expect(trackCountry("")).toBeNull();
    expect(trackCountry("ZZ")).toBeNull();
  });
});
