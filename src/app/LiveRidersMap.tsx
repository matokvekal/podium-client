/**
 * The actual live-position map — only reached from LiveTracking.tsx while an event is live.
 * Kept as its own lazy-loaded file so a never-live event never pulls in Leaflet — same
 * lazy-Leaflet convention as RouteMap.tsx/TrackMap.tsx.
 *
 * Dark "Waze-like" look is a CSS filter on the tile pane only (map-module.css), not a second
 * tile provider — keeps this on the same free OSM tiles as every other map in the app (see
 * lib/config.ts's doc comment on why tiles are the one thing here that could ever cost money).
 *
 * Riders are real data only (see LiveTracking.tsx's doc comment) — this file never invents a
 * position. The viewer's own dot (selfPosition) is the one exception: it comes straight from
 * this device's own Geolocation API, drawn locally, never sent anywhere (AGENT.md: "This app
 * displays positions; it never sends them").
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { config } from "../lib/config";
import { formatAge } from "../lib/time";
import styles from "./LiveRidersMap.module.css";
import type { LiveRider } from "./LiveTracking";
import { bearingDeg, finishIcon, riderSquareIcon, selfPositionIcon, startIcon } from "./map-icons";

interface LiveRidersMapProps {
  riders: LiveRider[];
  /** The event's route, for start/finish markers — empty if no track was ever attached. */
  routePoints: [number, number][];
  /** This device's own position, once "Share my location" is on — see LiveTracking.tsx. */
  selfPosition: [number, number] | null;
  selectedRiderId: number | null;
  onSelectRider: (id: number | null) => void;
}

export default function LiveRidersMap({
  riders,
  routePoints,
  selfPosition,
  selectedRiderId,
  onSelectRider,
}: LiveRidersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Previous fix per rider, so a marker can point the way it's actually moving instead of
  // sitting arrow-less until a second position ever arrives.
  const prevPositions = useRef<Map<number, [number, number]>>(new Map());
  // Read once on mount below via a ref, not a reactive dependency — the route a live event is
  // running never changes underneath it, so this must not tear down and rebuild the whole map
  // (losing pan/zoom) just because the parent re-rendered with a new routePoints array
  // reference.
  const routePointsRef = useRef(routePoints);
  routePointsRef.current = routePoints;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    mapRef.current = map;
    L.tileLayer(config.tileUrl, { attribution: config.tileAttribution, maxZoom: 19 }).addTo(map);
    const points = routePointsRef.current;
    if (points.length > 0) {
      L.marker(points[0], { icon: startIcon(0) })
        .addTo(map)
        .bindTooltip("Start");
      L.marker(points[points.length - 1], { icon: finishIcon() })
        .addTo(map)
        .bindTooltip("Finish");
      L.polyline(points, { color: "#63a6fc", weight: 3, opacity: 0.6 }).addTo(map);
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    }
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = Date.now();
    const markers = riders.map((rider) => {
      const point: [number, number] = [rider.lat, rider.lng];
      const prev = prevPositions.current.get(rider.participantId);
      const heading = prev ? bearingDeg(prev, point) : null;
      prevPositions.current.set(rider.participantId, point);
      const stale = now - new Date(rider.recordedAt).getTime() > config.staleAfterMs;
      const selected = rider.participantId === selectedRiderId;

      const marker = rider.emergency
        ? L.circleMarker(point, {
            radius: 9,
            color: "#f87171",
            fillColor: "#f87171",
            fillOpacity: 1,
            className: "live-rider-sos",
          })
        : L.marker(point, { icon: riderSquareIcon(heading, { stale, selected }) });
      marker.bindTooltip(
        `${rider.name}${rider.bib ? ` #${rider.bib}` : ""} — ${rider.distanceKm} km, ${formatAge(rider.recordedAt)}${rider.emergency ? " — SOS" : ""}`,
      );
      marker.on("click", () => onSelectRider(rider.participantId));
      marker.addTo(map);
      return marker;
    });

    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [riders, selectedRiderId, onSelectRider]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selfPosition) return;
    const marker = L.marker(selfPosition, { icon: selfPositionIcon(), zIndexOffset: 1000 })
      .addTo(map)
      .bindTooltip("You");
    return () => {
      marker.remove();
    };
  }, [selfPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedRiderId == null) return;
    const rider = riders.find((r) => r.participantId === selectedRiderId);
    if (rider) map.panTo([rider.lat, rider.lng]);
  }, [selectedRiderId, riders]);

  return <div ref={containerRef} className={styles.map} />;
}
