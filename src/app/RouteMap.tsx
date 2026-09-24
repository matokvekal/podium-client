/**
 * A static route/course map — the polyline an event follows, with start and finish markers.
 * Not live rider tracking (that's milestone 6, unbuilt).
 *
 * Imported only via lazy(() => import("./RouteMap")) from EventResultsPage — Leaflet took
 * the bundle from 65 kB to 559 kB when a past session imported it eagerly for the (now
 * deleted) LiveMapPage, so every consumer of this file must stay lazy too.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { config } from "../lib/config";
import type { RideStop } from "../lib/ride-stops";
import {
  bearingDeg,
  directionArrowIcon,
  directionArrowIndices,
  draftStopIcon,
  finishIcon,
  restStopIcon,
  startIcon,
} from "./map-icons";
import { addStopLayer } from "./ride-stop-layer";
import styles from "./RouteMap.module.css";

interface RouteMapProps {
  points: [number, number][];
  heightPx?: number;
  /** Rider-marked rest/break stops — from an uploaded track's CSV (see lib/track-csv.ts).
   * Optional; most routes have none. */
  restStops?: [number, number][];
  /** The ride's saved stop points (lib/ride-stops.ts, sql/049). Optional — every caller that
   * does not pass the props below gets exactly the map it always had. */
  stopPoints?: RideStop[];
  /** The creator's map: saved stops can be dragged (reported through onStopMoved). */
  editableStops?: boolean;
  onStopMoved?: (stop: RideStop, lat: number, lng: number) => void;
  /** The red pin for a stop being added, or null when not adding. Draggable. */
  draftPoint?: [number, number] | null;
  onDraftMoved?: (lat: number, lng: number) => void;
  /** A tap on the map itself (not a marker) — used while adding, to place the pin there. */
  onMapTap?: (lat: number, lng: number) => void;
}

/** Module-level so the default is the SAME array every render. An inline `= []` default was a new
 * array each render, and the map effect below depends on it: every re-render of the ride page
 * destroyed and rebuilt the whole map — and dropped the stop pins with it. */
const NO_REST_STOPS: [number, number][] = [];

export default function RouteMap({
  points,
  heightPx = 220,
  restStops = NO_REST_STOPS,
  stopPoints,
  editableStops = false,
  onStopMoved,
  draftPoint = null,
  onDraftMoved,
  onMapTap,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Bumped each time a Leaflet map is created, so the stop / draft layers below redraw on EVERY
  // new map — never left behind on a map that was torn down.
  const [mapGen, setMapGen] = useState(0);
  // Callbacks read through refs so a parent re-render never rebuilds the map or its layers.
  const onStopMovedRef = useRef(onStopMoved);
  onStopMovedRef.current = onStopMoved;
  const onDraftMovedRef = useRef(onDraftMoved);
  onDraftMovedRef.current = onDraftMoved;
  const onMapTapRef = useRef(onMapTap);
  onMapTapRef.current = onMapTap;

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    mapRef.current = map;

    L.tileLayer(config.tileUrl, { attribution: config.tileAttribution, maxZoom: 19 }).addTo(map);

    const line = L.polyline(points, { color: "#63a6fc", weight: 4 }).addTo(map);

    if (points.length > 1) {
      const startHeading = bearingDeg(points[0], points[1]);
      L.marker(points[0], { icon: startIcon(startHeading) })
        .addTo(map)
        .bindTooltip("Start");
    } else {
      L.marker(points[0], { icon: startIcon(0) })
        .addTo(map)
        .bindTooltip("Start");
    }
    L.marker(points[points.length - 1], { icon: finishIcon() })
      .addTo(map)
      .bindTooltip("Finish");

    // A handful of small direction arrows along the way — see map-icons.ts for why this is
    // capped and sparse rather than one per segment.
    for (const i of directionArrowIndices(points.length)) {
      const heading = bearingDeg(points[i - 1], points[i + 1]);
      L.marker(points[i], { icon: directionArrowIcon(heading), interactive: false }).addTo(map);
    }

    const restMarkers = restStops.map((point) =>
      L.marker(point, { icon: restStopIcon() }).bindTooltip("Rest stop").addTo(map),
    );

    map.on("click", (e: L.LeafletMouseEvent) => onMapTapRef.current?.(e.latlng.lat, e.latlng.lng));

    map.fitBounds(line.getBounds(), { padding: [24, 24] });
    setMapGen((n) => n + 1);
    // Leaflet mis-measures inside a flex/tab container until it's told to re-check its size.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      for (const marker of restMarkers) marker.remove();
    };
  }, [points, restStops]);

  // Saved stop points — their own layer, drawn after the map above exists (effects run in
  // order) and redrawn only when the stops change. A failure here is contained: the route map
  // keeps working without the pins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mapGen is the "a new map exists" signal — the pins must be redrawn on it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !stopPoints || stopPoints.length === 0) return;
    let layer: L.LayerGroup | null = null;
    try {
      layer = addStopLayer(map, stopPoints, {
        draggable: editableStops,
        onMoved: (stop, lat, lng) => onStopMovedRef.current?.(stop, lat, lng),
      });
    } catch (err) {
      console.error("[RouteMap] stop points not drawn", err);
    }
    return () => {
      try {
        layer?.remove();
      } catch {
        // The map itself may already be gone (route changed) — nothing left to clean.
      }
    };
  }, [mapGen, stopPoints, editableStops]);

  // The red "new stop" pin while the creator is adding one. Brought into view when it lands
  // outside it (a search result elsewhere); a tap inside the view leaves the zoom alone.
  const draftLat = draftPoint?.[0];
  const draftLng = draftPoint?.[1];
  // biome-ignore lint/correctness/useExhaustiveDependencies: mapGen is the "a new map exists" signal — the pin must be redrawn on it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || draftLat == null || draftLng == null) return;
    let marker: L.Marker | null = null;
    try {
      const at: [number, number] = [draftLat, draftLng];
      marker = L.marker(at, { icon: draftStopIcon(), draggable: true, zIndexOffset: 1000 }).addTo(
        map,
      );
      marker.on("dragend", () => {
        const pos = marker?.getLatLng();
        if (pos) onDraftMovedRef.current?.(pos.lat, pos.lng);
      });
      if (!map.getBounds().contains(at)) map.setView(at, Math.max(map.getZoom(), 15));
    } catch (err) {
      console.error("[RouteMap] draft pin not drawn", err);
    }
    return () => {
      try {
        marker?.remove();
      } catch {
        // see above
      }
    };
  }, [mapGen, draftLat, draftLng]);

  return <div ref={containerRef} className={styles.map} style={{ height: heightPx }} />;
}
