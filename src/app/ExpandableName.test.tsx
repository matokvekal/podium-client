/**
 * @vitest-environment jsdom
 */

// The organizer name wraps rather than overflows. jsdom has no layout, so "is it clipped" is
// faked through scrollHeight/clientHeight — what is verified is the contract around that:
// the full text is always in the DOM, direction follows the script, the line clamp is applied,
// and the Show more / Show less control appears only when clipped (and only when enabled).

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandableName } from "./ExpandableName";

function fakeClipped(clipped: boolean) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(clipped ? 100 : 20);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(20);
}

afterEach(() => vi.restoreAllMocks());

describe("ExpandableName", () => {
  it("renders the name unchanged, with the requested line clamp", () => {
    fakeClipped(false);
    const name = "רוכבים בתקווה - אגף הספורט עיריית פתח תקווה";
    render(<ExpandableName text={name} lines={3} />);
    const el = screen.getByText(name);
    expect(el.style.webkitLineClamp).toBe("3");
    expect(el.getAttribute("dir")).toBe("rtl");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses LTR for English and survives an unbroken URL", () => {
    fakeClipped(false);
    const url = `https://example.com/${"a".repeat(200)}`;
    render(<ExpandableName text={url} />);
    expect(screen.getByText(url).getAttribute("dir")).toBe("ltr");
  });

  it("offers Show more when clipped, and toggles", () => {
    fakeClipped(true);
    render(<ExpandableName text="A very long organizer name that does not fit" />);
    const button = screen.getByRole("button", { name: "Show more" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    expect(screen.getByText("A very long organizer name that does not fit").dataset.expanded).toBe(
      "true",
    );
  });

  it("never draws the toggle when toggle={false}", () => {
    fakeClipped(true);
    render(<ExpandableName text="Clipped but no toggle" toggle={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
