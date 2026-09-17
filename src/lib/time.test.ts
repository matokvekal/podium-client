// isSameLocalDay — the rule that decides which of an organizer's rides may share one link.
//
// The tests are written in LOCAL time on purpose (`new Date(y, m, d, h)`), because that is
// what the function answers about, and a test written in UTC would pass or fail depending on
// where it ran. The server deliberately does not reproduce this rule — it has no timezone for
// the organizer and enforces only a coarse 24-hour span — so this is the only place the
// precise answer is decided, which is why it is pinned.

import { describe, expect, it } from "vitest";
import { isSameLocalDay } from "./time";

/** A local wall-clock instant, whatever zone this test happens to run in. */
function local(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("isSameLocalDay — the same day", () => {
  it("is true for two rides hours apart on one morning (the long / short case)", () => {
    expect(isSameLocalDay(local(2026, 9, 19, 7), local(2026, 9, 19, 7, 30))).toBe(true);
  });

  it("is true across the whole span of one day, 00:00 to 23:59", () => {
    expect(isSameLocalDay(local(2026, 9, 19, 0, 0), local(2026, 9, 19, 23, 59))).toBe(true);
  });

  it("is true for the same instant", () => {
    const at = local(2026, 9, 19, 7);
    expect(isSameLocalDay(at, at)).toBe(true);
  });

  it("accepts ISO strings as well as Dates, since that is what the API sends", () => {
    const a = local(2026, 9, 19, 7);
    const b = local(2026, 9, 19, 9);
    expect(isSameLocalDay(a.toISOString(), b.toISOString())).toBe(true);
  });
});

describe("isSameLocalDay — different days", () => {
  it("⚠ is false across local midnight, even one minute apart", () => {
    // The pair the server's 24-hour span DOES allow and this rule does not. That asymmetry is
    // deliberate: the client decides what to offer, the server only refuses the absurd.
    expect(isSameLocalDay(local(2026, 9, 19, 23, 59), local(2026, 9, 20, 0, 1))).toBe(false);
  });

  it("is false for consecutive days at the same hour", () => {
    expect(isSameLocalDay(local(2026, 9, 19, 7), local(2026, 9, 20, 7))).toBe(false);
  });

  it("is false for the same day number in a different month", () => {
    expect(isSameLocalDay(local(2026, 9, 19), local(2026, 10, 19))).toBe(false);
  });

  it("is false for the same day and month in a different year", () => {
    expect(isSameLocalDay(local(2026, 9, 19), local(2027, 9, 19))).toBe(false);
  });
});

describe("isSameLocalDay — missing and malformed", () => {
  it("is false when either side is null or undefined — not 'maybe'", () => {
    const at = local(2026, 9, 19, 7);
    expect(isSameLocalDay(null, at)).toBe(false);
    expect(isSameLocalDay(at, null)).toBe(false);
    expect(isSameLocalDay(undefined, at)).toBe(false);
    expect(isSameLocalDay(null, null)).toBe(false);
  });

  it("is false for an empty string, which is how a blank field arrives", () => {
    expect(isSameLocalDay("", local(2026, 9, 19))).toBe(false);
  });

  it("is false for an unparseable date rather than throwing", () => {
    expect(isSameLocalDay("not a date", local(2026, 9, 19))).toBe(false);
  });
});
