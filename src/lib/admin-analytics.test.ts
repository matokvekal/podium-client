import { describe, expect, it } from "vitest";
import {
  countryFlag,
  countryName,
  type DailyRow,
  DEFAULT_RANGE,
  formatCount,
  formatDisplayDate,
  sortDailyNewestFirst,
} from "./admin-analytics";

describe("formatDisplayDate", () => {
  it("YYYY-MM-DD -> DD/MM/YYYY with no timezone shift", () => {
    expect(formatDisplayDate("2026-09-07")).toBe("07/09/2026");
    expect(formatDisplayDate("2026-01-01")).toBe("01/01/2026");
  });
  it("leaves anything unexpected alone", () => {
    expect(formatDisplayDate("not a date")).toBe("not a date");
  });
});

describe("sortDailyNewestFirst", () => {
  const rows: DailyRow[] = [
    { date: "2026-09-05", newUsers: 1, newRides: 1, newParticipants: 1 },
    { date: "2026-09-07", newUsers: 1, newRides: 1, newParticipants: 1 },
    { date: "2026-09-06", newUsers: 1, newRides: 1, newParticipants: 1 },
  ];

  it("orders newest first and does not mutate the input", () => {
    const sorted = sortDailyNewestFirst(rows);
    expect(sorted.map((r) => r.date)).toEqual(["2026-09-07", "2026-09-06", "2026-09-05"]);
    expect(rows[0].date).toBe("2026-09-05"); // unchanged
  });

  it("the load-bearing invariant: daily[0].date >= daily[1].date", () => {
    const sorted = sortDailyNewestFirst(rows);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].date >= sorted[i].date).toBe(true);
    }
  });

  it("an already-sorted or empty list is fine", () => {
    expect(sortDailyNewestFirst([])).toEqual([]);
  });
});

describe("country + count helpers", () => {
  it("names known countries, falls back to the code", () => {
    expect(countryName("IL")).toBe("Israel");
    expect(countryName("SE")).toBe("Sweden");
    expect(countryName("ZZ")).toBe("ZZ");
  });
  it("builds a flag emoji, empty for junk", () => {
    expect(countryFlag("IL")).toBe("🇮🇱");
    expect(countryFlag("x")).toBe("");
  });
  it("groups thousands with commas", () => {
    expect(formatCount(1240)).toBe("1,240");
    expect(formatCount(486)).toBe("486");
    expect(formatCount(2931000)).toBe("2,931,000");
    expect(formatCount(Number.NaN)).toBe("—");
  });
});

describe("DEFAULT_RANGE", () => {
  it("is 30 days, per the spec", () => {
    expect(DEFAULT_RANGE).toBe("30");
  });
});
