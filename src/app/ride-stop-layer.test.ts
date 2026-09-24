/**
 * @vitest-environment jsdom
 */

// A stop's label is the creator's own text and is shown to every rider on the map. Leaflet puts
// STRING tooltip / popup content in with innerHTML, so these pin that the label never reaches
// the map as a string — script-like text must come out as the same text, not as markup.

import L from "leaflet";
import { afterEach, describe, expect, it } from "vitest";
import type { RideStop } from "../lib/ride-stops";
import { addStopLayer } from "./ride-stop-layer";

function stop(id: number, label: string, lat = 32.1, lng = 34.8): RideStop {
  return {
    id,
    rideId: "r",
    label,
    lat,
    lng,
    kind: "coffee",
    sortOrder: id,
    createdAt: "",
    updatedAt: "",
  };
}

let host: HTMLDivElement | null = null;
function makeMap(): L.Map {
  host = document.createElement("div");
  host.style.width = "400px";
  host.style.height = "300px";
  document.body.appendChild(host);
  return L.map(host).setView([32.1, 34.8], 12);
}

afterEach(() => {
  host?.remove();
  host = null;
});

const NASTY = [
  `<img src=x onerror="window.__pwned=1">`,
  `<script>window.__pwned=1</script>`,
  `קפה "הבית" & <b>bold</b> ☕`,
];

describe("addStopLayer — labels are plain text", () => {
  it("tooltip and popup render the label as text, never as HTML", () => {
    const map = makeMap();
    const layer = addStopLayer(map, NASTY.map((label, i) => stop(i + 1, label)));
    const markers = layer.getLayers() as L.Marker[];
    expect(markers).toHaveLength(NASTY.length);

    markers.forEach((marker, i) => {
      marker.openTooltip();
      const tip = marker.getTooltip()?.getElement();
      expect(tip?.textContent).toBe(NASTY[i]);
      expect(tip?.querySelector("img, script, b")).toBeNull();

      marker.openPopup();
      const popup = marker.getPopup()?.getElement();
      expect(popup?.textContent).toContain(NASTY[i]);
      expect(popup?.querySelector("img, script, b")).toBeNull();
      const link = popup?.querySelector("a");
      expect(link?.getAttribute("href")).toBe(
        "https://www.google.com/maps/dir/?api=1&destination=32.1%2C34.8",
      );
      expect(link?.getAttribute("rel")).toContain("noopener");
      marker.closePopup();
    });
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    map.remove();
  });

  it("skips a stop with an unusable position and keeps drawing the rest", () => {
    const map = makeMap();
    const layer = addStopLayer(map, [stop(1, "ok"), stop(2, "bad", Number.NaN, 35)]);
    expect(layer.getLayers()).toHaveLength(1);
    map.remove();
  });

  it("is removable without touching anything else on the map", () => {
    const map = makeMap();
    const route = L.polyline([
      [32, 34.8],
      [32.2, 34.8],
    ]).addTo(map);
    const layer = addStopLayer(map, [stop(1, "a")]);
    layer.remove();
    expect(map.hasLayer(route)).toBe(true);
    expect(map.hasLayer(layer)).toBe(false);
    map.remove();
  });
});
