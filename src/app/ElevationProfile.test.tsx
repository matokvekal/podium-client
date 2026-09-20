/**
 * @vitest-environment jsdom
 */

// The empty state is OPT-IN: Find Tracks and every other caller must still collapse to nothing
// when a route has no elevation series, while the ride page (which passes showEmpty) keeps the
// chart's slot so the wind strip below it never moves up into it. Neither path may invent a value.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ElevationProfile } from "./ElevationProfile";

const POINTS: [number, number][] = [
  [32.0, 34.8],
  [32.0, 34.85],
  [32.0, 34.9],
  [32.0, 34.95],
];
const ELEVATIONS = [10, 40, 25, 60];

afterEach(cleanup);

describe("ElevationProfile", () => {
  it("draws the chart when the route has elevations", () => {
    render(<ElevationProfile points={POINTS} elevations={ELEVATIONS} showEmpty />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Elevation profile over/);
    expect(screen.queryByText("No elevation data for this route")).toBeNull();
  });

  it("renders nothing without elevations by default (Find Tracks and the other callers)", () => {
    const { container } = render(<ElevationProfile points={POINTS} elevations={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps its slot with a neutral placeholder when showEmpty is set", () => {
    const { container } = render(
      <ElevationProfile points={POINTS} elevations={undefined} heightPx={96} showEmpty />,
    );
    expect(screen.getByText("No elevation data for this route")).toBeTruthy();
    const slot = container.firstElementChild as HTMLElement;
    expect(slot.style.height).toBe("96px");
    // No line, axis or number of any kind: nothing that could be read as terrain.
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("does not fabricate a profile from a series that does not line up with the route", () => {
    render(<ElevationProfile points={POINTS} elevations={[10, 20]} showEmpty />);
    expect(screen.getByText("No elevation data for this route")).toBeTruthy();
  });
});
