import { describe, expect, it } from "vitest";
import { isPromoteLocked, splitDescriptionLinks } from "./promote";

describe("isPromoteLocked", () => {
  const promoted = { promoteOnly: true, ownerId: 5 };
  it("never locks a normal event", () => {
    expect(isPromoteLocked({ promoteOnly: false, ownerId: 5 }, null)).toBe(false);
    expect(isPromoteLocked({ ownerId: 5 }, { id: 9 })).toBe(false);
  });
  it("locks guests and normal users on a promoted event", () => {
    expect(isPromoteLocked(promoted, null)).toBe(true);
    expect(isPromoteLocked(promoted, { id: 9 })).toBe(true);
  });
  it("never locks the System Admin or the owner", () => {
    expect(isPromoteLocked(promoted, { id: 9, canManagePromote: true })).toBe(false);
    expect(isPromoteLocked(promoted, { id: 5 })).toBe(false);
  });
});

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
