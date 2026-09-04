import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_MODE,
  normalizeUserMode,
  organizerSwitchEnabled,
  shouldForceRiderMode,
} from "./user-mode";

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

describe("shouldForceRiderMode", () => {
  it("forces rider only on an explicit server 'false'", () => {
    expect(shouldForceRiderMode(false)).toBe(true);
  });

  it("leaves the stored preference alone when the server allows it, or when unknown", () => {
    expect(shouldForceRiderMode(true)).toBe(false);
    expect(shouldForceRiderMode(undefined)).toBe(false);
  });
});

describe("organizerSwitchEnabled", () => {
  it("is interactive only when the server has affirmatively said yes", () => {
    expect(organizerSwitchEnabled(true)).toBe(true);
    expect(organizerSwitchEnabled(false)).toBe(false);
    expect(organizerSwitchEnabled(undefined)).toBe(false);
  });
});
