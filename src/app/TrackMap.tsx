/**
 * Multi-track overview map for the "Find Tracks" planner — every matching track's line at
 * once, the selected one highlighted, hazard/POI markers toggleable as layers.
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
import type { Track } from "../lib/track-types";
import {
  bearingDeg,
  directionArrowIcon,
  directionArrowIndices,
  finishIcon,
  restStopIcon,
  startIcon,
} from "./map-icons";
import styles from "./TrackMap.module.css";

// Only "high" (very dangerous) rider-reported hazards are ever drawn — see TrackCard.tsx's
// doc comment for the reasoning: no green/good-road marker exists, since an unreported road
// isn't proven safe, just unreported.
const DANGER_COLOR = "#df4b7b";

const POI_COLOR: Record<Track["pois"][number]["type"], string> = {
  gas: "#f5b942",
  toilet: "#63a6fc",
  motel: "#3edda4",
  shop: "#293042",
  rest: "#3edda4",
};

interface TrackMapProps {
  tracks: Track[];
  selectedTrackId: string | null;
  showHazards: boolean;
  showPois: boolean;
  dayOfWeek: number | null;
  onSelectTrack?: (id: string) => void;
}

export default function TrackMap({
  tracks,
  selectedTrackId,
  showHazards,
  showPois,
  dayOfWeek,
  onSelectTrack,
}: TrackMapProps) {
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
      const selected = track.id === selectedTrackId;
      const line = L.polyline(track.points, {
        color: selected ? "#63a6fc" : "#9db3cc",
        weight: selected ? 5 : 3,
        opacity: selected ? 1 : 0.6,
      });
      if (onSelectTrack) line.on("click", () => onSelectTrack(track.id));
      line.addTo(map);
      layers.push(line);
      allBounds.push(...track.points);

      const start = track.points[0];
      const startHeading =
        track.points.length > 1 ? bearingDeg(track.points[0], track.points[1]) : 0;
      const startMarker = L.marker(start, { icon: startIcon(startHeading) }).bindTooltip(
        track.name,
      );
      startMarker.addTo(map);
      layers.push(startMarker);

      const finishMarker = L.marker(track.points[track.points.length - 1], {
        icon: finishIcon(),
      }).bindTooltip(`${track.name} — finish`);
      finishMarker.addTo(map);
      layers.push(finishMarker);

      // A handful of small direction arrows along the way — sparse and capped, see
      // map-icons.ts. Only for the selected track, so an unselected overview line in a busy
      // multi-track view doesn't get cluttered with arrows nobody asked to see yet.
      if (selected) {
        for (const i of directionArrowIndices(track.points.length)) {
          const heading = bearingDeg(track.points[i - 1], track.points[i + 1]);
          const arrow = L.marker(track.points[i], {
            icon: directionArrowIcon(heading),
            interactive: false,
          });
          arrow.addTo(map);
          layers.push(arrow);
        }
      }

      if (showHazards) {
        for (const hazard of track.hazards) {
          if (hazard.severity !== "high") continue;
          if (dayOfWeek != null && hazard.dayOfWeek !== dayOfWeek) continue;
          const marker = L.circleMarker(hazard.point, {
            radius: 6,
            color: DANGER_COLOR,
            fillColor: DANGER_COLOR,
            fillOpacity: 0.85,
          }).bindTooltip(`${hazard.description} (rider-reported, not verified)`);
          marker.addTo(map);
          layers.push(marker);
        }
      }

      if (showPois) {
        for (const poi of track.pois) {
          const marker =
            poi.type === "rest"
              ? L.marker(poi.point, { icon: restStopIcon() })
              : L.circleMarker(poi.point, {
                  radius: 5,
                  color: POI_COLOR[poi.type],
                  fillColor: POI_COLOR[poi.type],
                  fillOpacity: 0.85,
                });
          marker.bindTooltip(`${poi.name} (${poi.type === "rest" ? "rest stop" : poi.type})`);
          marker.addTo(map);
          layers.push(marker);
        }
      }
    }

    if (allBounds.length > 0) {
      const selected = tracks.find((t) => t.id === selectedTrackId);
      const bounds = L.latLngBounds(selected ? selected.points : allBounds);
      map.fitBounds(bounds, { padding: [24, 24] });
    }

    return () => {
      for (const layer of layers) layer.remove();
    };
  }, [tracks, selectedTrackId, showHazards, showPois, dayOfWeek, onSelectTrack]);

  return <div ref={containerRef} className={styles.map} />;
}
