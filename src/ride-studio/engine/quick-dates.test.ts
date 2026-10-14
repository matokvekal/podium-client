import { describe, expect, it } from "vitest";
import {
  joinDateParts,
  nextWeekday,
  QUICK_TIMES,
  quickDayOf,
  splitDateString,
  toDateString,
} from "./quick-dates";

// Local calendar dates (month is 0-based): the shortcuts are the rider's own calendar.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe("next Friday / Saturday / Sunday", () => {
  it("are the next occurrences after today (Monday 12 Oct 2026)", () => {
    const now = at(2026, 10, 12);
    expect(nextWeekday("fri", now)).toBe("2026-10-16");
    expect(nextWeekday("sat", now)).toBe("2026-10-17");
    expect(nextWeekday("sun", now)).toBe("2026-10-18");
  });

  it("are strictly after today: on the day itself they mean a week later", () => {
    expect(nextWeekday("fri", at(2026, 10, 16))).toBe("2026-10-23"); // Friday
    expect(nextWeekday("sat", at(2026, 10, 17))).toBe("2026-10-24"); // Saturday
    expect(nextWeekday("sun", at(2026, 10, 18))).toBe("2026-10-25"); // Sunday
  });

  it("the day after: Saturday asked on a Friday is tomorrow, Sunday asked on a Saturday too", () => {
    expect(nextWeekday("sat", at(2026, 10, 16))).toBe("2026-10-17");
    expect(nextWeekday("sun", at(2026, 10, 17))).toBe("2026-10-18");
  });

  it("cross the year end into the next year", () => {
    const wed = at(2026, 12, 30);
    expect(nextWeekday("fri", wed)).toBe("2027-01-01");
    expect(nextWeekday("sat", wed)).toBe("2027-01-02");
    expect(nextWeekday("sun", wed)).toBe("2027-01-03");
    expect(nextWeekday("fri", at(2026, 12, 31))).toBe("2027-01-01");
  });

  it("cross a month end and a leap day", () => {
    expect(nextWeekday("fri", at(2028, 2, 28))).toBe("2028-03-03");
    expect(nextWeekday("sat", at(2028, 2, 25))).toBe("2028-02-26");
    expect(nextWeekday("sun", at(2028, 2, 27))).toBe("2028-03-05");
  });

  it("read the rider's calendar day even at 23:59 and just after midnight", () => {
    expect(nextWeekday("fri", at(2026, 10, 12, 23, 59))).toBe("2026-10-16");
    expect(nextWeekday("fri", at(2026, 10, 13, 0, 1))).toBe("2026-10-16");
  });

  it("are never off by one around a daylight-saving change (Israel, 25 Oct 2026)", () => {
    expect(nextWeekday("sun", at(2026, 10, 22))).toBe("2026-10-25");
    expect(nextWeekday("fri", at(2026, 10, 25))).toBe("2026-10-30");
    expect(nextWeekday("sat", at(2027, 3, 25))).toBe("2027-03-27"); // spring forward week
  });
});

describe("helpers", () => {
  it("formats a local date", () => {
    expect(toDateString(at(2026, 1, 5))).toBe("2026-01-05");
  });

  it("recognises which shortcut a stored day is", () => {
    const now = at(2026, 10, 12);
    expect(quickDayOf("2026-10-16", now)).toBe("fri");
    expect(quickDayOf("2026-10-17", now)).toBe("sat");
    expect(quickDayOf("2026-10-18", now)).toBe("sun");
    expect(quickDayOf("2026-10-19", now)).toBeNull();
    expect(quickDayOf("", now)).toBeNull();
  });

  it("joins hand-picked parts only when they make a real day", () => {
    expect(joinDateParts({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
    expect(joinDateParts({ year: 2026, month: 11, day: 31 })).toBe("");
    expect(joinDateParts({ year: 2027, month: 2, day: 29 })).toBe("");
    expect(joinDateParts({ year: 2028, month: 2, day: 29 })).toBe("2028-02-29");
    expect(joinDateParts({ year: 2026, month: 0, day: 7 })).toBe("");
  });

  it("splits a date string", () => {
    expect(splitDateString("2026-03-07")).toEqual({ year: 2026, month: 3, day: 7 });
    expect(splitDateString("nope")).toBeNull();
  });

  it("offers the five departure times", () => {
    expect([...QUICK_TIMES]).toEqual(["06:00", "06:30", "07:00", "07:30", "08:00"]);
  });
});
