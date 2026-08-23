/**
 * Multi-route overview map for the "Find Tracks" planner — every matching public route's line
 * at once, with the selected one highlighted.
 *
 * The hazard and point-of-interest layers this used to draw are gone. They came from the
 * deleted mock library: no server field exists for either, and a rider-reported "very
 * dangerous" marker invented from nothing is a safety claim on a road someone is about to
 * ride. The lines, start/finish markers and direction arrows are all real geometry.
 *
 * Lines come from each route's `previewPoints` — the thinned line the list endpoint returns
 * for exactly this purpose. A route whose preview is empty is skipped rather than drawn at
 * (0, 0).
 *
 * Not a RouteMap.tsx extension: that component's API is one polyline for one event's route.
 * This needs many at once plus per-track marker layers, different enough to be its own file.
 * Imported only via lazy(() => import("./TrackMap")) — same Leaflet-stays-lazy rule as
 * RouteMap.tsx.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { config } from "../lib/config";
import type { PublicRoute } from "../lib/track-types";
import {
  bearingDeg,
  directionArrowIcon,
  directionArrowIndices,
  finishIcon,
  startIcon,
} from "./map-icons";
import styles from "./TrackMap.module.css";

interface TrackMapProps {
  tracks: PublicRoute[];
  selectedTrackId: number | null;
  onSelectTrack?: (id: number) => void;
}

export default function TrackMap({ tracks, selectedTrackId, onSelectTrack }: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    mapRef.current = map;
    L.tileLayer(config.tileUrl, { attribution: config.tileAttribution, maxZoom: 19 }).addTo(map);
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];
    const allBounds: L.LatLngBoundsExpression = [];

    for (const track of tracks) {
      // No preview line, nothing to draw. Skipped entirely rather than plotted from a
      // fallback coordinate.
      const points = track.previewPoints;
      if (!points || points.length === 0) continue;
      const label = track.name?.trim() || track.placeName?.trim() || "Route";
      const selected = track.id === selectedTrackId;
      const line = L.polyline(points, {
        color: selected ? "#63a6fc" : "#9db3cc",
        weight: selected ? 5 : 3,
        opacity: selected ? 1 : 0.6,
      });
      if (onSelectTrack) line.on("click", () => onSelectTrack(track.id));
      line.addTo(map);
      layers.push(line);
      allBounds.push(...points);

      const start = points[0];
      const startHeading = points.length > 1 ? bearingDeg(points[0], points[1]) : 0;
      const startMarker = L.marker(start, { icon: startIcon(startHeading) }).bindTooltip(label);
      startMarker.addTo(map);
      layers.push(startMarker);

      const finishMarker = L.marker(points[points.length - 1], {
        icon: finishIcon(),
      }).bindTooltip(`${label} — finish`);
      finishMarker.addTo(map);
      layers.push(finishMarker);

      // A handful of small direction arrows along the way — sparse and capped, see
      // map-icons.ts. Only for the selected track, so an unselected overview line in a busy
      // multi-track view doesn't get cluttered with arrows nobody asked to see yet.
      if (selected) {
        for (const i of directionArrowIndices(points.length)) {
          const heading = bearingDeg(points[i - 1], points[i + 1]);
          const arrow = L.marker(points[i], {
            icon: directionArrowIcon(heading),
            interactive: false,
          });
          arrow.addTo(map);
          layers.push(arrow);
        }
      }

    }

    if (allBounds.length > 0) {
      const selected = tracks.find((t) => t.id === selectedTrackId);
      const selectedPoints = selected?.previewPoints;
      const bounds = L.latLngBounds(
        selectedPoints && selectedPoints.length > 0 ? selectedPoints : allBounds,
      );
      map.fitBounds(bounds, { padding: [24, 24] });
    }

    return () => {
      for (const layer of layers) layer.remove();
    };
  }, [tracks, selectedTrackId, onSelectTrack]);

  return <div ref={containerRef} className={styles.map} />;
}
