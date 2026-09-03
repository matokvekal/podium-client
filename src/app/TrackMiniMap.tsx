/**
 * A real, interactive OpenStreetMap map inside a gallery card. Pan it, zoom it, look at what
 * the route actually goes past — the same map ability as anywhere else in the app.
 *
 * THE PROBLEM THIS SOLVES, AND WHY IT IS NOT JUST "RouteMap IN A CARD".
 *
 * A Leaflet map is not free: an instance, a tile layer, DOM for every tile, and its own event
 * handlers. RouteMap is built for one map on a page. A gallery scrolling through hundreds of
 * cards, each holding a live map for as long as the list is open, would end with hundreds of
 * live instances and a tile request for every one of them — which is both a dead phone and an
 * abuse of a free tile server that explicitly asks not to be used that way.
 *
 * So the map here is WINDOWED. It only exists while its card is on screen (plus a small
 * margin), and it is destroyed the moment the card scrolls away — the DOM node, the tile
 * layer and the handlers with it. However far a rider scrolls, only the handful of cards they
 * can actually see hold a map, so cost is bounded by the size of the screen rather than by the
 * length of the list.
 *
 * The SVG thumbnail (track-thumbnail.ts) is still drawn underneath as the instant placeholder:
 * it paints in about a millisecond from geometry already in memory, so the card shows the real
 * shape of the route immediately and the tiles fade in behind it a moment later. A card is
 * never blank, and a rider on a bad connection who never gets tiles still sees the route.
 *
 * SCROLL-WHEEL ZOOM IS HANDED OVER ON HOVER, not held all the time. Left permanently on, a
 * flick of the wheel anywhere over the gallery zooms whatever map happens to be under the
 * pointer instead of scrolling the list — the classic embedded-map trap. The map takes the
 * wheel while the pointer is over it and gives it straight back on leave. Dragging,
 * double-click zoom, the zoom buttons and pinch-zoom on touch are live the whole time, so no
 * map ability is actually withheld — and touch devices, which have no hover and no wheel, are
 * unaffected either way.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { config } from "../lib/config";
import { bearingDeg, finishIcon, startIcon } from "./map-icons";
import styles from "./TrackMiniMap.module.css";

interface TrackMiniMapProps {
  points: [number, number][];
  /** Announced to screen readers, since the map itself is a picture to them. */
  label: string;
}

export default function TrackMiniMap({ points, label }: TrackMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [wheelEnabled, setWheelEnabled] = useState(false);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = L.map(containerRef.current, {
      // Compact controls: a card is small, and a full zoom bar plus a long attribution line
      // would cover the route they are there to show.
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      // Leaflet's own tap handler fights vertical scrolling inside a scroll container on iOS;
      // dragging still works, and this keeps a swipe over a card scrolling the gallery.
      tapHold: false,
    });
    mapRef.current = map;

    L.tileLayer(config.tileUrl, {
      attribution: config.tileAttribution,
      maxZoom: 19,
      // Tiles already fetched for one card are reused by the next, which matters a lot here:
      // neighbouring rides in this app are often in the same area.
      crossOrigin: true,
    }).addTo(map);

    const line = L.polyline(points, { color: "#3f86e7", weight: 4, opacity: 0.95 }).addTo(map);
    // A white casing under the line, so it reads over both pale fields and dark forest tiles.
    L.polyline(points, { color: "#ffffff", weight: 7, opacity: 0.7 }).addTo(map).bringToBack();

    const heading = points.length > 1 ? bearingDeg(points[0], points[1]) : 0;
    L.marker(points[0], { icon: startIcon(heading), interactive: false }).addTo(map);
    L.marker(points[points.length - 1], { icon: finishIcon(), interactive: false }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    // Leaflet mis-measures inside a flex/grid container until told to re-check its size.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  // The wheel handover described in the file comment.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (wheelEnabled) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [wheelEnabled]);

  return (
    <div
      ref={containerRef}
      className={styles.map}
      role="application"
      aria-label={`Map of ${label}`}
      onMouseEnter={() => setWheelEnabled(true)}
      onMouseLeave={() => setWheelEnabled(false)}
    />
  );
}
