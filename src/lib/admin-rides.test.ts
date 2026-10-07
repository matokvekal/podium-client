import { describe, expect, it } from "vitest";
import { type AdminRide, effectiveRideLimit, parseRiderLimitInput } from "./admin-rides";

describe("parseRiderLimitInput", () => {
  it("reads blank as 'no override'", () => {
    expect(parseRiderLimitInput("")).toEqual({ ok: true, value: null });
    expect(parseRiderLimitInput("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts whole numbers, with thousands separators", () => {
    expect(parseRiderLimitInput("300")).toEqual({ ok: true, value: 300 });
    expect(parseRiderLimitInput("30,000")).toEqual({ ok: true, value: 30_000 });
    expect(parseRiderLimitInput(" 30 000 ")).toEqual({ ok: true, value: 30_000 });
    expect(parseRiderLimitInput("100000")).toEqual({ ok: true, value: 100_000 });
  });

  it.each(["0", "-5", "2.5", "abc", "100001"])("refuses %s", (raw) => {
    expect(parseRiderLimitInput(raw).ok).toBe(false);
  });
});

describe("effectiveRideLimit", () => {
  const base = { ownerLimit: 50, maxParticipants: null } as AdminRide;
  it("is the account limit without an override, the override with one", () => {
    expect(effectiveRideLimit(base)).toBe(50);
    expect(effectiveRideLimit({ ...base, maxParticipants: 30_000 })).toBe(30_000);
  });
});
