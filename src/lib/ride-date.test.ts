import { describe, expect, it } from "vitest";
import {
  formatRideDay,
  formatRideStart,
  isPastDatetimeLocal,
  joinDatetimeLocal,
  splitDatetimeLocal,
} from "./ride-date";

describe("ride date — day | month name | year", () => {
  it("07 | Nov | 2026 is 7 November, not 11 July", () => {
    const value = joinDatetimeLocal({ day: 7, month: 11, year: 2026 }, "07:00");
    expect(value).toBe("2026-11-07T07:00");
    const local = new Date(value);
    expect(local.getMonth()).toBe(10); // November
    expect(local.getDate()).toBe(7);
    expect(formatRideDay(local)).toBe("07-Nov-2026");
    expect(formatRideStart(value)).toBe("Saturday, 07-Nov-2026 at 07:00");
  });

  it("never shows a numeric month", () => {
    expect(formatRideStart("2026-07-11T07:00")).toBe("Saturday, 11-Jul-2026 at 07:00");
  });

  it("stays empty until date and time are both complete, like datetime-local did", () => {
    expect(joinDatetimeLocal({ day: 7, month: 11, year: 0 }, "07:00")).toBe("");
    expect(joinDatetimeLocal({ day: 7, month: 11, year: 2026 }, "")).toBe("");
    expect(joinDatetimeLocal({ day: 31, month: 11, year: 2026 }, "07:00")).toBe(""); // 31 Nov
  });

  it("round-trips the form value and keeps the time untouched", () => {
    expect(splitDatetimeLocal("2026-11-07T07:45")).toEqual({
      date: { year: 2026, month: 11, day: 7 },
      time: "07:45",
    });
  });

  it("knows a past value", () => {
    const now = new Date("2026-10-07T12:00");
    expect(isPastDatetimeLocal("2026-07-11T07:00", now)).toBe(true);
    expect(isPastDatetimeLocal("2026-11-07T07:00", now)).toBe(false);
    expect(isPastDatetimeLocal("", now)).toBe(false);
  });
});
