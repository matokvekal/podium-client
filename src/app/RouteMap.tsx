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
import { useEffect, useRef } from "react";
import { config } from "../lib/config";
import {
  bearingDeg,
  directionArrowIcon,
  directionArrowIndices,
  finishIcon,
  restStopIcon,
  startIcon,
} from "./map-icons";
import styles from "./RouteMap.module.css";

interface RouteMapProps {
  points: [number, number][];
  heightPx?: number;
  /** Rider-marked rest/break stops — from an uploaded track's CSV (see lib/track-csv.ts).
   * Optional; most routes have none. */
  restStops?: [number, number][];
}

export default function RouteMap({ points, heightPx = 220, restStops = [] }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

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

    map.fitBounds(line.getBounds(), { padding: [24, 24] });
    // Leaflet mis-measures inside a flex/tab container until it's told to re-check its size.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      for (const marker of restMarkers) marker.remove();
    };
  }, [points, restStops]);

  return <div ref={containerRef} className={styles.map} style={{ height: heightPx }} />;
}
