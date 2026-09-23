import { describe, expect, it } from "vitest";
import { parseTrackId, trackSharePath } from "./track-share-url";

describe("trackSharePath", () => {
  it("names the terrain and the track id", () => {
    expect(trackSharePath("mtb", 12)).toBe("/mtb/12");
    expect(trackSharePath("gravel", 7)).toBe("/gravel/7");
    expect(trackSharePath("road", 99)).toBe("/road/99");
  });

  it("falls back to /mtb for a discipline with no share path", () => {
    expect(trackSharePath("hiking", 5)).toBe("/mtb/5");
    expect(trackSharePath(null, 5)).toBe("/mtb/5");
  });
});

describe("parseTrackId", () => {
  it("accepts a positive integer", () => {
    expect(parseTrackId("1234")).toBe(1234);
  });

  it("rejects anything else", () => {
    for (const bad of [undefined, "", "0", "-3", "1.5", "abc", "12abc"]) {
      expect(parseTrackId(bad)).toBeNull();
    }
  });
});
