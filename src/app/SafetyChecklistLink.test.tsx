/**
 * @vitest-environment jsdom
 */

// The ride page's safety checklist integration point: the link, the rider's red/green pill and
// the checkable sheet, with ticks persisted per USER + RIDE. The page itself only decides
// `trackFor` (a rider → their user id + ride id; creator / non-rider / signed-out → null).

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safetyChecklistKey } from "../lib/safety-checklist";
import { SafetyChecklistLink } from "./SafetyChecklistLink";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const ALL = ["Helmet", "Front & rear lights", "Water", "Repair kit", "Sunglasses", "Gloves"];

const link = () => screen.getByRole("button", { name: /safety checklist/i });
const open = () => fireEvent.click(link());
const close = () => fireEvent.click(screen.getByRole("button", { name: "Close" }));
const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;
const box = (label: string) => screen.getByRole("checkbox", { name: new RegExp(`^${label}`) });

describe("rider", () => {
  const rider = (userId = 1, rideId = "ride-a") => ({ userId, rideId });

  it("starts at 0/6 (red) with six unticked checkboxes", () => {
    render(<SafetyChecklistLink trackFor={rider()} />);
    expect(link().getAttribute("aria-label")).toBe("Safety checklist, 0 of 6 ready");
    expect(link().textContent).toContain("0/6");
    open();
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    for (const cb of screen.getAllByRole("checkbox")) expect(checked(cb)).toBe(false);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("0 of 6 ready");
    expect(screen.getByText("0 of 6 ready")).toBeTruthy();
  });

  it("ticking updates the count; all six → Ready; unticking → incomplete again", () => {
    render(<SafetyChecklistLink trackFor={rider()} />);
    open();
    fireEvent.click(box("Helmet"));
    expect(checked(box("Helmet"))).toBe(true);
    expect(screen.getByText("1 of 6 ready")).toBeTruthy();
    for (const label of ALL.slice(1)) fireEvent.click(box(label));
    expect(screen.getByText(/All 6 ready/)).toBeTruthy();
    close();
    expect(link().getAttribute("aria-label")).toBe("Safety checklist, ready");
    expect(link().textContent).toContain("Ready");

    open();
    fireEvent.click(box("Water"));
    close();
    expect(link().getAttribute("aria-label")).toBe("Safety checklist, 5 of 6 ready");
    expect(link().textContent).toContain("5/6");
  });

  it("the whole row (label text) toggles the checkbox", () => {
    render(<SafetyChecklistLink trackFor={rider()} />);
    open();
    fireEvent.click(screen.getByText("Every ride, no exceptions."));
    expect(checked(box("Helmet"))).toBe(true);
  });

  it("persists across unmount / remount", () => {
    const { unmount } = render(<SafetyChecklistLink trackFor={rider()} />);
    open();
    fireEvent.click(box("Helmet"));
    fireEvent.click(box("Water"));
    unmount();
    render(<SafetyChecklistLink trackFor={rider()} />);
    expect(link().textContent).toContain("2/6");
    open();
    expect(checked(box("Helmet"))).toBe(true);
    expect(checked(box("Gloves"))).toBe(false);
  });

  it("ride A never affects ride B, and switching back restores A", () => {
    const { rerender } = render(<SafetyChecklistLink trackFor={rider(1, "ride-a")} />);
    open();
    for (const label of ALL.slice(0, 4)) fireEvent.click(box(label));
    close();
    expect(link().textContent).toContain("4/6");

    rerender(<SafetyChecklistLink trackFor={rider(1, "ride-b")} />);
    expect(link().textContent).toContain("0/6");

    rerender(<SafetyChecklistLink trackFor={rider(1, "ride-a")} />);
    expect(link().textContent).toContain("4/6");
    open();
    for (const label of ALL.slice(4)) fireEvent.click(box(label));
    close();
    expect(link().textContent).toContain("Ready");

    rerender(<SafetyChecklistLink trackFor={rider(1, "ride-b")} />);
    expect(link().textContent).toContain("0/6");
    expect(localStorage.getItem(safetyChecklistKey(1, "ride-b"))).toBeNull();
  });

  it("user A's ticks are never shown to user B on the same ride", () => {
    const { rerender } = render(<SafetyChecklistLink trackFor={rider(1, "ride-a")} />);
    open();
    fireEvent.click(box("Helmet"));
    close();
    rerender(<SafetyChecklistLink trackFor={rider(2, "ride-a")} />);
    expect(link().textContent).toContain("0/6");
    open();
    expect(checked(box("Helmet"))).toBe(false);
  });

  it("corrupt or unknown saved data starts unticked and does not crash", () => {
    localStorage.setItem(safetyChecklistKey(1, "ride-a"), "{broken");
    localStorage.setItem(safetyChecklistKey(1, "ride-b"), '{"ids":["helmet","jetpack"]}');
    const { rerender } = render(<SafetyChecklistLink trackFor={rider(1, "ride-a")} />);
    expect(link().textContent).toContain("0/6");
    rerender(<SafetyChecklistLink trackFor={rider(1, "ride-b")} />);
    expect(link().textContent).toContain("1/6");
  });
});

describe("creator / non-rider / signed-out (trackFor = null)", () => {
  it("shows the plain link and a read-only list — no pill, no checkboxes", () => {
    localStorage.setItem(safetyChecklistKey(1, "ride-a"), '{"ids":["helmet"]}');
    render(<SafetyChecklistLink trackFor={null} />);
    expect(link().getAttribute("aria-label")).toBeNull();
    expect(link().textContent).not.toMatch(/\d\/6|Ready/);
    open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialog).queryByRole("progressbar")).toBeNull();
    for (const label of ALL) expect(within(dialog).getByText(label)).toBeTruthy();
  });
});

describe("motion", () => {
  it("prefers-reduced-motion switches off every icon animation", () => {
    // Vitest doesn't process CSS modules, so the rule is checked at the source; the real
    // browser behaviour was verified in Chromium with emulated reduced motion.
    const css = readFileSync("src/app/SafetySheet.module.css", "utf8").replace(/\r\n/g, "\n");
    const animated = css.match(/^(.+) \{\n {2}(?:transform-origin[^\n]*\n {2})?animation: anim-/gm);
    expect(animated).toHaveLength(6);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    // Same specificity as the animated selectors and later in the file, so it wins.
    expect(reduced).toContain(
      ".item:not([data-checked]) .iconBadge[data-anim] .itemIcon {\n    animation: none;",
    );
  });
});
