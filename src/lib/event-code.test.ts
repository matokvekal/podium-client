import { describe, expect, it } from "vitest";
import { findEventByCode, normalizeEventCode } from "./event-code";
import type { EventSummary } from "./local-db";

function ride(over: Partial<EventSummary>): EventSummary {
  return {
    id: Math.random().toString(36),
    code: "31082026A",
    name: "Ride",
    type: "RIDE",
    status: "published",
    visibility: "public",
    displayMode: "standard",
    startsAt: null,
    endsAt: null,
    location: null,
    ownerId: 1,
    ownerName: null,
    ownerAvatarUrl: null,
    ...over,
  };
}

describe("normalizeEventCode", () => {
  it("upper-cases and trims, which is the only variation a human introduces", () => {
    expect(normalizeEventCode("  31082026a ")).toBe("31082026A");
  });
});

describe("findEventByCode", () => {
  const finished = ride({ id: "past-1", code: "28082026A", status: "finished" });
  const upcoming = ride({ id: "next-1", code: "31082026A" });
  const events = [finished, upcoming];

  it("finds a ride that has already happened — the case by-code refuses", () => {
    // GET /events/by-code/28082026A answers 404 because the server keeps is_active false for a
    // finished ride, which is how a shared link turned into "No event has that code" the
    // morning after the ride.
    expect(findEventByCode(events, "28082026A")?.id).toBe("past-1");
  });

  it("matches however the rider typed it", () => {
    expect(findEventByCode(events, " 28082026a ")?.id).toBe("past-1");
  });

  it("normalizes the stored code too, not just the input", () => {
    const messy = [ride({ id: "messy", code: " 05092026b " })];
    expect(findEventByCode(messy, "05092026B")?.id).toBe("messy");
  });

  it("returns null for a code that genuinely is not there", () => {
    expect(findEventByCode(events, "01012099Z")).toBeNull();
  });

  it("returns null for an empty or blank code rather than matching something", () => {
    expect(findEventByCode(events, "")).toBeNull();
    expect(findEventByCode(events, "   ")).toBeNull();
    // Guards the case where a stored code is itself blank and would otherwise match "".
    expect(findEventByCode([ride({ id: "blank", code: "" })], "")).toBeNull();
  });

  it("does not match on a partial code", () => {
    expect(findEventByCode(events, "2808")).toBeNull();
    expect(findEventByCode(events, "28082026AB")).toBeNull();
  });
});
