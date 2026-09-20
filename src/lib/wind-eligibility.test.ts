import { describe, expect, it } from "vitest";
import {
  canSeeWindForecast,
  isOwnerOrParticipant,
  isWindForecastEnabled,
} from "./wind-eligibility";

const ENABLED = { canSeeWindForecast: true };
const owner = { isOwner: true, myParticipant: null };
const approved = { isOwner: false, myParticipant: { registrationStatus: "approved" } };
const registered = { isOwner: false, myParticipant: { registrationStatus: "registered" } };
const pending = { isOwner: false, myParticipant: { registrationStatus: "waiting_approval" } };
const rejected = { isOwner: false, myParticipant: { registrationStatus: "rejected" } };
const stranger = { isOwner: false, myParticipant: null };

describe("wind forecast eligibility — BOTH conditions required", () => {
  it("enabled account + owner, or + participant → yes", () => {
    expect(canSeeWindForecast(ENABLED, owner)).toBe(true);
    expect(canSeeWindForecast(ENABLED, approved)).toBe(true);
    expect(canSeeWindForecast(ENABLED, registered)).toBe(true);
  });

  it("enabled account but not in the ride → no (pending, rejected, stranger)", () => {
    expect(canSeeWindForecast(ENABLED, pending)).toBe(false);
    expect(canSeeWindForecast(ENABLED, rejected)).toBe(false);
    expect(canSeeWindForecast(ENABLED, stranger)).toBe(false);
  });

  it("owner or participant on an account that is not enabled → no", () => {
    for (const profile of [{ canSeeWindForecast: false }, {}, null, undefined]) {
      expect(canSeeWindForecast(profile, owner)).toBe(false);
      expect(canSeeWindForecast(profile, approved)).toBe(false);
    }
  });

  it("only an explicit true enables (a cached older profile is a no)", () => {
    expect(isWindForecastEnabled({ canSeeWindForecast: true })).toBe(true);
    expect(isWindForecastEnabled({})).toBe(false);
    expect(isWindForecastEnabled({ canSeeWindForecast: "yes" as unknown as boolean })).toBe(false);
  });

  it("no event → no", () => {
    expect(isOwnerOrParticipant(null)).toBe(false);
    expect(canSeeWindForecast(ENABLED, undefined)).toBe(false);
  });
});
