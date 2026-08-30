import { describe, expect, it } from "vitest";
import {
  durationInputValue,
  formatDuration,
  MAX_DURATION_MIN,
  parseDuration,
} from "./ride-duration";

describe("parseDuration", () => {
  it("reads a bare number as hours", () => {
    expect(parseDuration("2")).toBe(120);
    expect(parseDuration("1")).toBe(60);
  });

  it("reads decimal hours", () => {
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("2.25")).toBe(135);
  });

  it("reads h:mm", () => {
    expect(parseDuration("2:45")).toBe(165);
    expect(parseDuration("0:30")).toBe(30);
  });

  it("reads h / h m suffix forms", () => {
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("2h30")).toBe(150);
    expect(parseDuration("2h 30m")).toBe(150);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("90 min")).toBe(90);
  });

  it("is forgiving of whitespace and case", () => {
    expect(parseDuration("  2H 15M ")).toBe(135);
  });

  it("returns null for empty / junk / out-of-range", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("-1")).toBeNull();
    expect(parseDuration(String(MAX_DURATION_MIN / 60 + 1))).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(165)).toBe("2h 45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("returns an empty string for nothing", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});

describe("durationInputValue", () => {
  it("round-trips through parseDuration", () => {
    for (const min of [60, 90, 135, 165, 30]) {
      expect(parseDuration(durationInputValue(min))).toBe(min);
    }
  });

  it("is empty for null", () => {
    expect(durationInputValue(null)).toBe("");
  });
});
