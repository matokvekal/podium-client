import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMOTE_MESSAGE,
  organizerDisplay,
  organizerForRequest,
  promoteMessageOf,
  splitDescriptionLinks,
} from "./promote";

describe("splitDescriptionLinks", () => {
  it("turns an https URL into a link part and keeps the rest as text", () => {
    expect(splitDescriptionLinks("Register: https://example.org/reg?id=1.")).toEqual([
      { kind: "text", text: "Register: " },
      { kind: "link", href: "https://example.org/reg?id=1", text: "https://example.org/reg?id=1" },
      { kind: "text", text: "." },
    ]);
  });
  it("never links javascript:, data: or bare markup", () => {
    const parts = splitDescriptionLinks('javascript:alert(1) <a href="x">y</a> data:text/html,hi');
    expect(parts.every((p) => p.kind === "text")).toBe(true);
  });
  it("returns plain text untouched", () => {
    expect(splitDescriptionLinks("no links")).toEqual([{ kind: "text", text: "no links" }]);
  });
});

describe("promoteMessageOf", () => {
  it("falls back to the default for null / undefined / blank, keeps a custom message", () => {
    expect(promoteMessageOf(null)).toBe(DEFAULT_PROMOTE_MESSAGE);
    expect(promoteMessageOf(undefined)).toBe(DEFAULT_PROMOTE_MESSAGE);
    expect(promoteMessageOf("  ")).toBe(DEFAULT_PROMOTE_MESSAGE);
    expect(promoteMessageOf("Call us")).toBe("Call us");
  });
});

describe("organizerForRequest (Organizer defaults to the creator)", () => {
  it("saves nothing (null) for the creator name or a blank field", () => {
    expect(organizerForRequest("Gilad", "Gilad")).toBeNull();
    expect(organizerForRequest("  Gilad ", "Gilad")).toBeNull();
    expect(organizerForRequest("", "Gilad")).toBeNull();
  });

  it("saves a custom name, trimmed", () => {
    expect(organizerForRequest(" Petah Tikva Municipality ", "Gilad")).toBe(
      "Petah Tikva Municipality",
    );
  });
});

describe("organizerDisplay", () => {
  it("shows the saved name, then the device-local name, then the owner (old events unchanged)", () => {
    expect(organizerDisplay("City", "Local Club", "Gilad")).toEqual({ name: "City", custom: true });
    expect(organizerDisplay(null, "Local Club", "Gilad")).toEqual({
      name: "Local Club",
      custom: true,
    });
    expect(organizerDisplay(null, null, "Gilad")).toEqual({ name: "Gilad", custom: false });
    expect(organizerDisplay(undefined, undefined, undefined)).toEqual({ name: null, custom: false });
  });
});
