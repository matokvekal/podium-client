import { describe, expect, it } from "vitest";
import { effectiveLimits } from "./entitlements";
import { FALLBACK_LIMITS } from "./plan-limits";

describe("effectiveLimits", () => {
  it("falls back to the offline defaults (3 / 50 / 2) with no profile", () => {
    expect(effectiveLimits(null)).toBe(FALLBACK_LIMITS);
    expect(effectiveLimits(undefined)).toEqual({
      maxEventsPerWeek: 3,
      maxParticipantsPerEvent: 50,
      maxGroupsPerEvent: 2,
    });
  });

  it("falls back when the profile carries no entitlements (cached v1 profile)", () => {
    expect(effectiveLimits({ entitlements: undefined })).toBe(FALLBACK_LIMITS);
  });

  it("uses the server's entitlements verbatim when present", () => {
    const entitlements = {
      maxEventsPerWeek: 10,
      maxParticipantsPerEvent: 200,
      maxGroupsPerEvent: 5,
    };
    expect(effectiveLimits({ entitlements })).toEqual(entitlements);
  });
});
