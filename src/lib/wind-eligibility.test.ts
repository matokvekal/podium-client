import { describe, expect, it } from "vitest";
import {
  canSeeWindForecast,
  isOwnerOrParticipant,
  isWindForecastEnabled,
  WIND_FORECAST_FOR_EVERYONE,
} from "./wind-eligibility";

const ENABLED = { canSeeWindForecast: true };
const owner = { isOwner: true, myParticipant: null };
const approved = { isOwner: false, myParticipant: { registrationStatus: "approved" } };
const registered = { isOwner: false, myParticipant: { registrationStatus: "registered" } };
const pending = { isOwner: false, myParticipant: { registrationStatus: "waiting_approval" } };
const rejected = { isOwner: false, myParticipant: { registrationStatus: "rejected" } };
const stranger = { isOwner: false, myParticipant: null };

describe("the switch", () => {
  it("is open to everyone now that the pilot is over", () => {
    expect(WIND_FORECAST_FOR_EVERYONE).toBe(true);
  });

  it("open to everyone: any rider who owns or rides the event, with or without the account flag", () => {
    for (const profile of [{ canSeeWindForecast: false }, {}, null, undefined]) {
      expect(canSeeWindForecast(profile, owner, true)).toBe(true);
      expect(canSeeWindForecast(profile, registered, true)).toBe(true);
      // Still not for someone who is not in the ride.
      expect(canSeeWindForecast(profile, stranger, true)).toBe(false);
      expect(canSeeWindForecast(profile, pending, true)).toBe(false);
    }
  });
});

describe("wind forecast eligibility (pilot mode) — BOTH conditions required", () => {
  it("enabled account + owner, or + participant → yes", () => {
    expect(canSeeWindForecast(ENABLED, owner, false)).toBe(true);
    expect(canSeeWindForecast(ENABLED, approved, false)).toBe(true);
    expect(canSeeWindForecast(ENABLED, registered, false)).toBe(true);
  });

  it("enabled account but not in the ride → no (pending, rejected, stranger)", () => {
    expect(canSeeWindForecast(ENABLED, pending, false)).toBe(false);
    expect(canSeeWindForecast(ENABLED, rejected, false)).toBe(false);
    expect(canSeeWindForecast(ENABLED, stranger, false)).toBe(false);
  });

  it("owner or participant on an account that is not enabled → no", () => {
    for (const profile of [{ canSeeWindForecast: false }, {}, null, undefined]) {
      expect(canSeeWindForecast(profile, owner, false)).toBe(false);
      expect(canSeeWindForecast(profile, approved, false)).toBe(false);
    }
  });

  it("only an explicit true enables (a cached older profile is a no)", () => {
    expect(isWindForecastEnabled({ canSeeWindForecast: true }, false)).toBe(true);
    expect(isWindForecastEnabled({}, false)).toBe(false);
    expect(isWindForecastEnabled({ canSeeWindForecast: "yes" as unknown as boolean }, false)).toBe(false);
  });

  it("no event → no", () => {
    expect(isOwnerOrParticipant(null)).toBe(false);
    expect(canSeeWindForecast(ENABLED, undefined, false)).toBe(false);
  });
});
