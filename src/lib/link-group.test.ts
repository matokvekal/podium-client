// ⚠ THE REGRESSION THIS FILE EXISTS FOR
//   The ride page's chip rendered a literal "1 of 2". Every ride in a group renders that chip,
//   so opening the SECOND of two connected rides told the reader they were on the first — and
//   the "Switch ride" link next to it then looked like it went nowhere useful. The position has
//   to be derived from the group's own ordering, and that ordering has to match the chooser
//   page's (the server's ORDER BY starts_at) or the two surfaces disagree about the same rides.

import { describe, expect, it } from "vitest";
import { dayGroupOrder, shareLinkPath } from "./link-group";

const LONG = { eventId: "long", startsAt: "2026-09-19T04:00:00.000Z" };
const SHORT = { eventId: "short", startsAt: "2026-09-19T04:30:00.000Z" };
const GRAVEL = { eventId: "gravel", startsAt: "2026-09-19T06:00:00.000Z" };

describe("shareLinkPath", () => {
  it("joins codes with a dash", () => {
    expect(shareLinkPath(["19092026A", "19092026B"])).toBe("/share/19092026A-19092026B");
  });

  it("handles one code and three", () => {
    expect(shareLinkPath(["19092026A"])).toBe("/share/19092026A");
    expect(shareLinkPath(["19092026A", "19092026B", "19092026C"])).toBe(
      "/share/19092026A-19092026B-19092026C",
    );
  });

  it("⚠ encodes each code separately, so the separator itself survives", () => {
    // encodeURIComponent on the joined string would turn the dash into %2D and the server
    // would then see a single code.
    expect(shareLinkPath(["A B", "C"])).toBe("/share/A%20B-C");
    expect(shareLinkPath(["19092026A", "19092026B"])).toContain("-");
  });

  it("drops blanks rather than emitting an empty segment", () => {
    expect(shareLinkPath(["19092026A", "  ", "19092026B"])).toBe("/share/19092026A-19092026B");
  });

  it("trims stray whitespace", () => {
    expect(shareLinkPath([" 19092026A ", "19092026B"])).toBe("/share/19092026A-19092026B");
  });

  it("preserves the order it was given — this ride leads", () => {
    expect(shareLinkPath(["19092026B", "19092026A"])).toBe("/share/19092026B-19092026A");
  });
});

describe("dayGroupOrder — the position is derived", () => {
  it("⚠ the EARLIER ride is 1 of 2", () => {
    expect(dayGroupOrder(LONG, [SHORT])).toEqual({ position: 1, total: 2 });
  });

  it("⚠ and the LATER ride is 2 of 2 — not 1 of 2", () => {
    expect(dayGroupOrder(SHORT, [LONG])).toEqual({ position: 2, total: 2 });
  });

  it("orders three rides by start time, whoever is asking", () => {
    expect(dayGroupOrder(LONG, [SHORT, GRAVEL]).position).toBe(1);
    expect(dayGroupOrder(SHORT, [LONG, GRAVEL]).position).toBe(2);
    expect(dayGroupOrder(GRAVEL, [LONG, SHORT]).position).toBe(3);
  });

  it("does not depend on the order the siblings arrive in", () => {
    expect(dayGroupOrder(GRAVEL, [SHORT, LONG])).toEqual(dayGroupOrder(GRAVEL, [LONG, SHORT]));
  });

  it("totals this ride plus its VISIBLE siblings", () => {
    // Siblings are already filtered server-side to what this viewer may see, so a group of
    // three that hides one must read "of 2", never "of 3".
    expect(dayGroupOrder(LONG, [SHORT]).total).toBe(2);
  });

  it("is 1 of 1 for a ride with no siblings, so a caller can gate on total > 1", () => {
    expect(dayGroupOrder(LONG, [])).toEqual({ position: 1, total: 1 });
  });
});

describe("dayGroupOrder — missing and odd start times", () => {
  it("sorts a ride with no start time LAST rather than dropping it", () => {
    const undated = { eventId: "undated", startsAt: null };
    expect(dayGroupOrder(undated, [LONG, SHORT])).toEqual({ position: 3, total: 3 });
    expect(dayGroupOrder(LONG, [undated, SHORT]).position).toBe(1);
  });

  it("still counts an undated sibling in the total", () => {
    expect(dayGroupOrder(LONG, [{ eventId: "undated", startsAt: null }]).total).toBe(2);
  });

  it("handles two rides starting at the same instant without reporting 0", () => {
    const twin = { eventId: "twin", startsAt: LONG.startsAt };
    const first = dayGroupOrder(LONG, [twin]);
    const second = dayGroupOrder(twin, [LONG]);
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.position).toBeGreaterThanOrEqual(1);
    expect(second.position).toBeGreaterThanOrEqual(1);
  });

  it("never reports position 0, even if the group somehow omits this ride", () => {
    const orphan = { eventId: "orphan", startsAt: LONG.startsAt };
    // Constructed by hand: dayGroupOrder always includes `self`, so this can only happen if a
    // caller passes a self whose id collides with nothing — the guard is here so a future
    // refactor that changes the matching cannot silently render "0 of 2".
    expect(dayGroupOrder(orphan, [LONG]).position).toBeGreaterThanOrEqual(1);
  });
});
