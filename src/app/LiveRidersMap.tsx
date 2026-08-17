/**
 * The actual live-position map — reached only from pages/LiveEventPage.tsx, the fully separate
 * live page (never embedded inline on EventDetailPage; see that page's own doc comment). Kept
 * as its own lazy-loaded file so a never-live event never pulls in Leaflet — same lazy-Leaflet
 * convention as RouteMap.tsx/TrackMap.tsx.
 *
 * Dark "Waze-like" look is a CSS filter on the tile pane only (map-module.css), not a second
 * tile provider — keeps this on the same free OSM tiles as every other map in the app (see
 * lib/config.ts's doc comment on why tiles are the one thing here that could ever cost money).
 *
 * Riders are real data only — this file never invents a position. A rider with no fix yet
 * (lat/lng null) is skipped as a marker entirely rather than drawn at a fake (0,0); the caller
 * still lists them by name in the riders drawer as "no position yet". The viewer's own dot
 * (selfPosition) is the one exception: it comes straight from this device's own Geolocation
 * API, drawn locally, never sent anywhere (AGENT.md: "This app displays positions; it never
 * sends them").
 *
 * Multi-select (selectedRiderIds) replaces the old single-select: a rider on a bike may be
 * tracking a few teammates at once, not just one. showOthers is a hard on/off for every other
 * rider's marker — the map itself, not the rider list, is the primary surface here, so this is
 * meant to be reached for rarely, not left half-open as a filter.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { config } from "../lib/config";
import { cumulativeDistanceKm, haversineDistanceKm, nearestIndexForDistance } from "../lib/geo";
import type { LiveRider } from "../lib/live-types";
import { formatAge } from "../lib/time";
import styles from "./LiveRidersMap.module.css";
import { bearingDeg, finishIcon, riderSquareIcon, selfPositionIcon, startIcon } from "./map-icons";

interface LiveRidersMapProps {
  riders: LiveRider[];
  /** The event's route, for start/finish markers and the traveled-portion overlay — empty if
   * no track was ever attached. */
  routePoints: [number, number][];
  /** This device's own position, once "Share my location" is on. */
  selfPosition: [number, number] | null;
  /** Off by default is wrong for this page — the map is the point, so this defaults to true
   * one level up in LiveEventPage.tsx; passed through here as a plain gate on the rendered
   * rider array. */
  showOthers: boolean;
  selectedRiderIds: number[];
  onToggleRider: (id: number) => void;
}

export default function LiveRidersMap({
  riders,
  routePoints,
  selfPosition,
  showOthers,
  selectedRiderIds,
  onToggleRider,
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

  // Riders with a real fix — a rider still waiting for their first location point is never
  // drawn (see this file's own doc comment), but they do still count for the traveled-track
  // and rider-marker effects below since both key off this same filtered list.
  const positioned = riders.filter(
    (r): r is LiveRider & { lat: number; lng: number } => r.lat != null && r.lng != null,
  );
  const displayed = showOthers ? positioned : [];

  // Traveled portion of the route per displayed rider — a brighter overlay on top of the base
  // polyline so "how far has this rider gotten, and which way is the route going from there" is
  // readable at a glance, per the "markers along the track up to here" ask. Approximates
  // "distance along the route" using the rider's own odometer-style distanceKm (their real
  // traveled distance, not a route projection) — a deliberate simplification the plan calls
  // for, good enough for "roughly here," not meant to be exact if a rider strays off-route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routePoints.length < 2) return;
    const cumulative = cumulativeDistanceKm(routePoints);
    const segments = displayed
      .filter((r) => r.distanceKm != null && r.distanceKm > 0)
      .map((r) => {
        const idx = nearestIndexForDistance(cumulative, r.distanceKm as number);
        if (idx < 1) return null;
        return L.polyline(routePoints.slice(0, idx + 1), {
          color: "#3edda4",
          weight: 5,
          opacity: 0.85,
        }).addTo(map);
      })
      .filter((line): line is L.Polyline => line !== null);
    return () => {
      for (const line of segments) line.remove();
    };
  }, [displayed, routePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = Date.now();
    const markers = displayed.map((rider) => {
      const point: [number, number] = [rider.lat, rider.lng];
      const prev = prevPositions.current.get(rider.participantId);
      const heading = prev ? bearingDeg(prev, point) : null;
      prevPositions.current.set(rider.participantId, point);
      const stale =
        rider.recordedAt == null ||
        now - new Date(rider.recordedAt).getTime() > config.staleAfterMs;
      const selected = selectedRiderIds.includes(rider.participantId);
      const distanceFromMe = selfPosition ? haversineDistanceKm(selfPosition, point) : null;

      const marker = rider.emergency
        ? L.circleMarker(point, {
            radius: 9,
            color: "#f87171",
            fillColor: "#f87171",
            fillOpacity: 1,
            className: "live-rider-sos",
          })
        : L.marker(point, { icon: riderSquareIcon(heading, { stale, selected }) });
      const distanceLabel =
        rider.distanceKm != null ? `${rider.distanceKm.toFixed(1)} km` : "no distance yet";
      const ageLabel = rider.recordedAt ? formatAge(rider.recordedAt) : "no update yet";
      const fromMeLabel =
        distanceFromMe != null ? ` — ${distanceFromMe.toFixed(1)} km from you` : "";
      marker.bindTooltip(
        `${rider.name}${rider.bib ? ` #${rider.bib}` : ""} — ${distanceLabel}, ${ageLabel}${fromMeLabel}${rider.emergency ? " — SOS" : ""}`,
      );
      marker.on("click", () => onToggleRider(rider.participantId));
      marker.addTo(map);
      return marker;
    });

    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [displayed, selectedRiderIds, selfPosition, onToggleRider]);

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

  // Only re-pan when the *selection* changes, not on every poll tick (which would change
  // `positioned`) — otherwise the map yanks the viewer's pan/zoom out from under them every
  // few seconds while riders move.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `positioned`
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedRiderIds.length === 0) return;
    const selected = positioned.filter((r) => selectedRiderIds.includes(r.participantId));
    if (selected.length === 0) return;
    if (selected.length === 1) {
      map.panTo([selected[0].lat, selected[0].lng]);
    } else {
      map.fitBounds(L.latLngBounds(selected.map((r) => [r.lat, r.lng])), { padding: [40, 40] });
    }
  }, [selectedRiderIds]);

  return <div ref={containerRef} className={styles.map} />;
}
