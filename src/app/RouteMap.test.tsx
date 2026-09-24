/**
 * @vitest-environment jsdom
 */

// Stop pins must survive a re-render of the ride page. They did not: RouteMap's `restStops = []`
// default was a NEW array on every render, so the map effect tore the map down and rebuilt it on
// each parent render — while the stop layer (whose own inputs had not changed) was never redrawn.
// On production the ride page re-renders as weather / chat / participant data arrive, so riders
// saw the stop list but an empty map.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RideStop } from "../lib/ride-stops";
import RouteMap from "./RouteMap";

const points: [number, number][] = [
  [32.0, 34.8],
  [32.1, 34.85],
  [32.2, 34.9],
];

function stop(id: number, label: string, lat: number, lng: number): RideStop {
  return { id, rideId: "r", label, lat, lng, kind: "coffee", sortOrder: id, createdAt: "", updatedAt: "" };
}

const stops = [stop(1, "Coffee", 32.05, 34.82), stop(2, "Water", 32.15, 34.88)];

const pinCount = (c: HTMLElement) => c.querySelectorAll(".leaflet-marker-icon[title]").length;

describe("RouteMap stop pins", () => {
  it("are drawn, and still there after the parent re-renders (rider view)", () => {
    const { container, rerender } = render(<RouteMap points={points} stopPoints={stops} />);
    expect(pinCount(container)).toBe(2);
    rerender(<RouteMap points={points} stopPoints={stops} />);
    rerender(<RouteMap points={points} stopPoints={stops} />);
    expect(pinCount(container)).toBe(2);
  });

  it("still there after a re-render for the creator's editable map", () => {
    const { container, rerender } = render(<RouteMap points={points} stopPoints={stops} editableStops />);
    rerender(<RouteMap points={points} stopPoints={stops} editableStops />);
    expect(pinCount(container)).toBe(2);
  });

  it("a re-render with the same props does not rebuild the map", () => {
    const { container, rerender } = render(<RouteMap points={points} stopPoints={stops} />);
    const mapEl = container.querySelector(".leaflet-map-pane");
    rerender(<RouteMap points={points} stopPoints={stops} />);
    expect(container.querySelector(".leaflet-map-pane")).toBe(mapEl);
  });

  it("follows a changed route: pins are redrawn on the new map", () => {
    const { container, rerender } = render(<RouteMap points={points} stopPoints={stops} />);
    rerender(<RouteMap points={[...points, [32.3, 34.95]]} stopPoints={stops} />);
    expect(pinCount(container)).toBe(2);
  });
});
