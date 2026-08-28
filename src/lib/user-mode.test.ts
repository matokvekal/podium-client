import { describe, expect, it } from "vitest";
import { DEFAULT_USER_MODE, normalizeUserMode } from "./user-mode";

describe("normalizeUserMode", () => {
  it("keeps a real organizer value", () => {
    expect(normalizeUserMode("organizer")).toBe("organizer");
  });

  it("keeps a real rider value", () => {
    expect(normalizeUserMode("rider")).toBe("rider");
  });

  it("falls back to rider for an absent value", () => {
    expect(normalizeUserMode(undefined)).toBe("rider");
    expect(normalizeUserMode(null)).toBe("rider");
  });

  it("falls back to rider for an unrecognised or junk value", () => {
    expect(normalizeUserMode("commissaire")).toBe("rider");
    expect(normalizeUserMode(42)).toBe("rider");
    expect(normalizeUserMode({})).toBe("rider");
  });

  it("defaults to rider", () => {
    expect(DEFAULT_USER_MODE).toBe("rider");
  });
});
