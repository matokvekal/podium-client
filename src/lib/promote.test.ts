import { describe, expect, it } from "vitest";
import { splitDescriptionLinks } from "./promote";

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
