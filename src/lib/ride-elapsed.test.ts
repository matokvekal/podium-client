import { describe, expect, it } from "vitest";
import { rideElapsedMs } from "./ride-elapsed";

const at = (hhmm: string) => Date.parse(`2026-09-23T${hhmm}:00Z`);
const iso = (hhmm: string) => `2026-09-23T${hhmm}:00Z`;

describe("rideElapsedMs", () => {
  it("counts from when the ride actually went live, not the planned start", () => {
    // Planned 07:00, started early at 06:45, now 06:50 → 5 minutes, not 00:00:00.
    expect(rideElapsedMs({ startedAt: iso("06:45"), startsAt: iso("07:00") }, at("06:50"))).toBe(
      5 * 60_000,
    );
  });

  it("does not count the wait when a ride started late", () => {
    expect(rideElapsedMs({ startedAt: iso("07:20"), startsAt: iso("07:00") }, at("07:30"))).toBe(
      10 * 60_000,
    );
  });

  it("falls back to the planned start for an older ride already past it", () => {
    expect(rideElapsedMs({ startedAt: null, startsAt: iso("07:00") }, at("07:30"))).toBe(
      30 * 60_000,
    );
  });

  it("hides the clock (null) instead of a frozen 00:00:00 when only a future planned start is known", () => {
    expect(rideElapsedMs({ startedAt: null, startsAt: iso("07:00") }, at("06:50"))).toBeNull();
    expect(rideElapsedMs({ startsAt: null }, at("06:50"))).toBeNull();
  });

  it("stops at the finish time on a finished ride", () => {
    expect(
      rideElapsedMs(
        { startedAt: iso("07:00"), startsAt: iso("07:00"), finishedAt: iso("09:00") },
        at("12:00"),
      ),
    ).toBe(2 * 3_600_000);
  });
});
