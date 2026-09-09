/**
 * @vitest-environment jsdom
 */

// Whether "Read more" appears is a LAYOUT question — the component asks the browser whether the
// clamped paragraph overflows. jsdom has no layout engine, so scrollHeight and clientHeight are
// both hardcoded 0 there and every description would look un-clipped. The heights are therefore
// stubbed per test, which is the one thing about this file worth understanding: `clipTo` is what
// stands in for "the CSS clamped this to four lines", and it is the only reason the button can
// be asserted on at all.
//
// The behaviour being pinned is the pair the old implementation got wrong — the button appears
// exactly when the text is actually cut off, and not otherwise — plus the direction attribute,
// which is what makes a Hebrew ride description readable.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RideDescription } from "./RideDescription";

afterEach(cleanup);

/**
 * Stand in for the CSS line clamp. `overflowing: false` models a short description, whose
 * scrollHeight equals the box it is drawn in.
 */
function clipTo(overflowing: boolean) {
  const clientHeight = 80; // ~4 lines
  Object.defineProperty(HTMLParagraphElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(HTMLParagraphElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (overflowing ? clientHeight * 3 : clientHeight),
  });
}

const LONG_HE =
  "יציאה בשעה 06:00 מאזור המרכז. המסלול כולל מספר עליות קשות ואנחנו נעצור לקפה באמצע הדרך.";
const SHORT_EN = "We leave at 06:00.";

describe("RideDescription", () => {
  it("shows a short description in full, with no toggle", () => {
    clipTo(false);
    render(<RideDescription text={SHORT_EN} />);

    expect(screen.getByText(SHORT_EN)).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Read more when the text is actually cut off", () => {
    clipTo(true);
    render(<RideDescription text={LONG_HE} />);

    const toggle = screen.getByRole("button", { name: "Read more" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands in place when Read more is pressed", () => {
    clipTo(true);
    render(<RideDescription text={LONG_HE} />);

    fireEvent.click(screen.getByRole("button", { name: "Read more" }));

    const toggle = screen.getByRole("button", { name: "Show less" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Expanded is the absence of the clamp, not a taller one — that is what lets the card grow
    // to the text instead of scrolling inside a fixed box.
    expect(screen.getByText(LONG_HE).getAttribute("data-expanded")).toBe("true");
  });

  it("collapses again when Show less is pressed", () => {
    clipTo(true);
    render(<RideDescription text={LONG_HE} />);

    fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));

    const toggle = screen.getByRole("button", { name: "Read more" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(LONG_HE).getAttribute("data-expanded")).toBeNull();
  });

  it("lays a Hebrew description out right-to-left", () => {
    clipTo(false);
    render(<RideDescription text={LONG_HE} />);

    expect(screen.getByText(LONG_HE).getAttribute("dir")).toBe("rtl");
  });

  it("lays an English description out left-to-right", () => {
    clipTo(false);
    render(<RideDescription text={SHORT_EN} />);

    expect(screen.getByText(SHORT_EN).getAttribute("dir")).toBe("ltr");
  });

  it("renders HTML-looking text as literal characters, never as markup", () => {
    clipTo(false);
    const hostile = "<img src=x onerror=alert(1)> <b>bold</b>";
    const { container } = render(<RideDescription text={hostile} />);

    // The whole string survives as text, and no element was created from it.
    expect(screen.getByText(hostile)).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("keeps the toggle a real button so it is keyboard reachable", () => {
    clipTo(true);
    render(<RideDescription text={LONG_HE} />);

    expect(screen.getByRole("button", { name: "Read more" }).tagName).toBe("BUTTON");
  });
});
