import { describe, expect, it } from "vitest";
import { type AutoCheckInOutcome, isFinalOutcome, shouldAttemptAutoCheckIn } from "./auto-check-in";
import { arrivalLabel, isAutoArrival } from "./arrival";

const START = Date.parse("2026-09-20T05:30:00Z");
const MIN = 60_000;
const JOINED = new Set(["ride-1"]);

function ride(overrides: Partial<Parameters<typeof shouldAttemptAutoCheckIn>[0]> = {}) {
  return {
    id: "ride-1",
    autoCheckIn: true,
    startsAt: new Date(START).toISOString(),
    status: "published" as const,
    ...overrides,
  };
}

describe("shouldAttemptAutoCheckIn", () => {
  it("asks at the start time for a ride the rider is on, with the switch on", () => {
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START, 60)).toBe(true);
  });

  it("asks right up to the window edge, before and after the start", () => {
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START - 60 * MIN, 60)).toBe(true);
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START + 60 * MIN, 60)).toBe(true);
  });

  it("does not ask a minute outside the window — so no location prompt a week early", () => {
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START - 61 * MIN, 60)).toBe(false);
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START + 61 * MIN, 60)).toBe(false);
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START - 7 * 24 * 60 * MIN, 60)).toBe(false);
  });

  it("uses the configured window", () => {
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START - 90 * MIN, 120)).toBe(true);
    expect(shouldAttemptAutoCheckIn(ride(), JOINED, START - 90 * MIN, 60)).toBe(false);
  });

  it("does not ask when the organizer left auto check-in off, or an older server never said", () => {
    expect(shouldAttemptAutoCheckIn(ride({ autoCheckIn: false }), JOINED, START, 60)).toBe(false);
    expect(shouldAttemptAutoCheckIn(ride({ autoCheckIn: undefined }), JOINED, START, 60)).toBe(
      false,
    );
  });

  it("does not ask for a ride the person only organizes and does not ride", () => {
    expect(shouldAttemptAutoCheckIn(ride(), new Set(), START, 60)).toBe(false);
    expect(shouldAttemptAutoCheckIn(ride({ id: "other" }), JOINED, START, 60)).toBe(false);
  });

  it.each(["cancelled", "finished"] as const)("does not ask for a %s ride", (status) => {
    expect(shouldAttemptAutoCheckIn(ride({ status }), JOINED, START, 60)).toBe(false);
  });

  it("does not ask for a ride with no start time, or an unreadable one", () => {
    expect(shouldAttemptAutoCheckIn(ride({ startsAt: null }), JOINED, START, 60)).toBe(false);
    expect(shouldAttemptAutoCheckIn(ride({ startsAt: "not a date" }), JOINED, START, 60)).toBe(
      false,
    );
  });
});

describe("isFinalOutcome", () => {
  it.each([
    "arrived",
    "already_recorded",
    "organizer_decided",
    "disabled",
    "closed",
    "no_start_point",
  ] as AutoCheckInOutcome[])("%s stops the asking", (outcome) => {
    expect(isFinalOutcome(outcome)).toBe(true);
  });

  it.each([
    "too_far",
    "inaccurate",
    "outside_window",
    "not_approved",
  ] as AutoCheckInOutcome[])("%s keeps the asking going", (outcome) => {
    expect(isFinalOutcome(outcome)).toBe(false);
  });
});

describe("arrivalLabel", () => {
  it("labels an organizer-ticked arrival exactly as before", () => {
    expect(arrivalLabel("present", "manual")).toEqual({ text: "✓ Arrived", tone: "ok" });
    expect(arrivalLabel("present")).toEqual({ text: "✓ Arrived", tone: "ok" });
    // A row from before the source column existed reads as manual.
    expect(arrivalLabel("present", null)).toEqual({ text: "✓ Arrived", tone: "ok" });
  });

  it("marks an automatic arrival with Auto and its own tone", () => {
    expect(arrivalLabel("present", "auto")).toEqual({ text: "✓ Arrived · Auto", tone: "auto" });
  });

  it("keeps Auto visible once the rider has also set off", () => {
    expect(arrivalLabel("started", "auto")).toEqual({
      text: "✓ Arrived · Auto · started",
      tone: "auto",
    });
    expect(arrivalLabel("started", "manual")).toEqual({
      text: "✓ Arrived · started",
      tone: "ok",
    });
  });

  it("never calls a rider who is not present 'Auto'", () => {
    expect(arrivalLabel("unknown", "auto")).toEqual({ text: "Not arrived", tone: "warn" });
    expect(arrivalLabel("dns", "auto")).toEqual({ text: "Did not start", tone: "bad" });
  });

  it("shows an unrecognised status verbatim instead of guessing", () => {
    expect(arrivalLabel("teleported")).toEqual({ text: "teleported", tone: "warn" });
  });
});

describe("isAutoArrival", () => {
  it("is true only for a present or started rider whose source is auto", () => {
    expect(isAutoArrival("present", "auto")).toBe(true);
    expect(isAutoArrival("started", "auto")).toBe(true);
    expect(isAutoArrival("present", "manual")).toBe(false);
    expect(isAutoArrival("present", null)).toBe(false);
    expect(isAutoArrival("present", undefined)).toBe(false);
    expect(isAutoArrival("unknown", "auto")).toBe(false);
  });
});
