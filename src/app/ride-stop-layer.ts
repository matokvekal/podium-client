// Draws a ride's stop points (lib/ride-stops.ts) onto a Leaflet map as ONE layer group, for both
// the ride page map (RouteMap.tsx) and the live map (LiveRidersMap.tsx). Kept in its own layer
// so adding, moving or removing a stop never rebuilds the map, the route line or the riders.
//
// Imported only by those two lazy map components — Leaflet stays out of the main bundle.
//
// The label is the creator's own text, so it is set with textContent, never as HTML.

import L from "leaflet";
import { RIDE_STOP_KIND_ICON, type RideStop, stopGoogleMapsUrl } from "../lib/ride-stops";
import { stopPointIcon } from "./map-icons";

function popupContent(stop: RideStop): HTMLElement {
  const box = document.createElement("div");
  box.style.minWidth = "140px";
  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.marginBottom = "4px";
  title.dir = "auto";
  title.textContent = stop.label;
  const link = document.createElement("a");
  link.href = stopGoogleMapsUrl(stop);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open in Google Maps";
  box.append(title, link);
  return box;
}

export interface StopLayerOptions {
  /** The creator's map: markers can be dragged; `onMoved` gets the new position. */
  draggable?: boolean;
  onMoved?: (stop: RideStop, lat: number, lng: number) => void;
}

/**
 * Returns the layer already added to `map`. Never throws for one bad stop: a stop with an
 * unusable position is skipped, so the rest (and the map) keep working.
 */
export function addStopLayer(
  map: L.Map,
  stops: readonly RideStop[],
  options: StopLayerOptions = {},
): L.LayerGroup {
  const group = L.layerGroup();
  for (const stop of stops) {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) continue;
    const marker = L.marker([stop.lat, stop.lng], {
      icon: stopPointIcon(RIDE_STOP_KIND_ICON[stop.kind] ?? "☕"),
      draggable: options.draggable === true,
      keyboard: true,
      title: stop.label,
      zIndexOffset: 500,
    });
    marker.bindTooltip(stop.label, { direction: "top", offset: [0, -12] });
    marker.bindPopup(() => popupContent(stop));
    if (options.draggable && options.onMoved) {
      const onMoved = options.onMoved;
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        onMoved(stop, lat, lng);
      });
    }
    group.addLayer(marker);
  }
  group.addTo(map);
  return group;
}
