import { describe, expect, it } from "vitest";
import { classifyRegion, IL_REGIONS, isRegionKey, REGION_KEYS, regionLabel } from "./regions";

describe("regions (client mirror of the server list)", () => {
  it("REGION_KEYS matches IL_REGIONS in order", () => {
    expect([...REGION_KEYS]).toEqual(IL_REGIONS.map((r) => r.key));
  });

  it("classifyRegion places well-known points", () => {
    expect(classifyRegion(32.08, 34.78)).toBe("center"); // Tel Aviv
    expect(classifyRegion(31.78, 35.22)).toBe("jerusalem"); // Jerusalem
    expect(classifyRegion(29.55, 34.95)).toBe("eilat"); // tiny box beats the Arava
    expect(classifyRegion(32.99, 35.69)).toBe("golan"); // Katzrin
  });

  it("returns null outside every box or on bad input", () => {
    expect(classifyRegion(48.85, 2.35)).toBeNull();
    expect(classifyRegion(null, 35)).toBeNull();
    expect(classifyRegion(Number.NaN, 35)).toBeNull();
  });

  it("regionLabel gives the Hebrew label, or falls through", () => {
    expect(regionLabel("north")).toBe("צפון");
    expect(regionLabel("mars")).toBe("mars");
    expect(regionLabel(null)).toBe("");
  });

  it("isRegionKey validates membership", () => {
    expect(isRegionKey("negev")).toBe(true);
    expect(isRegionKey("atlantis")).toBe(false);
  });
});
