/**
 * The actual live-position map — reached only from pages/LiveEventPage.tsx, the fully separate
 * full-screen live page. Kept as its own lazy-loaded file so a never-live event never pulls in
 * Leaflet — same lazy-Leaflet convention as RouteMap.tsx/TrackMap.tsx.
 *
 * Dark "Waze-like" look is a CSS filter on the tile pane only (LiveRidersMap.module.css), not a
 * second tile provider — keeps this on the same free OSM tiles as every other map in the app.
 *
 * Riders are real data only — this file never invents a position. A rider with no fix yet
 * (lat/lng null) is skipped as a marker entirely rather than drawn at a fake (0,0); the caller
 * still lists them by name in the riders sheet. The viewer's own dot (selfPosition) comes
 * straight from this device's own Geolocation API.
 *
 * Map stability rules (field use — the creator glances at this mid-ride):
 *   - the map NEVER auto-pans on a position poll; markers move, the viewport does not;
 *   - the viewport only moves when the user asks: tapping a rider in the sheet, or the
 *     Center control (which bumps `recenter.nonce`);
 *   - `recenter.mode` decides the target: "self" pans to the viewer's own dot at the current
 *     zoom; "route" fits the whole route. A non-participating creator only ever gets "route".
 *
 * Route progress overlay (creator): the viewer's own GPS position is projected ONTO the route
 * polyline (lib/geo.ts `nearestPointOnRoute` — a real perpendicular projection, never a
 * straight line from the start). The travelled portion is redrawn darker/stronger on top of
 * the lighter base line.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { config } from "../lib/config";
import {
  cumulativeDistanceKm,
  haversineDistanceKm,
  nearestIndexForDistance,
  nearestPointOnRoute,
} from "../lib/geo";
import type { LiveRider } from "../lib/live-types";
import { formatAge } from "../lib/time";
import styles from "./LiveRidersMap.module.css";
import { bearingDeg, finishIcon, riderSquareIcon, selfPositionIcon, startIcon } from "./map-icons";

export interface RecenterCommand {
  /** Bumped by the parent every time the Center control is tapped; 0 means "never asked". */
  nonce: number;
  mode: "self" | "route";
}

interface LiveRidersMapProps {
  riders: LiveRider[];
  /** The event's route, for start/finish markers and the travelled-portion overlay — empty if
   * no track was ever attached. */
  routePoints: [number, number][];
  /** This device's own position, once location sharing is on (or null when not sharing). */
  selfPosition: [number, number] | null;
  /** The viewer's own participant id, so their marker/progress isn't also drawn by the generic
   * per-rider overlay. Null for a non-participating creator. */
  selfParticipantId: number | null;
  /** Hard on/off for every OTHER rider's marker. */
  showOthers: boolean;
  selectedRiderIds: number[];
  onToggleRider: (id: number) => void;
  /** One-shot recenter request from the parent (Center control / initial framing). */
  recenter: RecenterCommand;
}

export default function LiveRidersMap({
  riders,
  routePoints,
  selfPosition,
  selfParticipantId,
  showOthers,
  selectedRiderIds,
  onToggleRider,
  recenter,
}: LiveRidersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Previous fix per rider, so a marker can point the way it's actually moving.
  const prevPositions = useRef<Map<number, [number, number]>>(new Map());
  // Route + self position read via refs inside the recenter effect so that effect depends
  // ONLY on `recenter` (the nonce) and never re-runs — and never re-pans — on a poll tick.
  const routePointsRef = useRef(routePoints);
  routePointsRef.current = routePoints;
  const selfPositionRef = useRef(selfPosition);
  selfPositionRef.current = selfPosition;
  // Whether the initial view has ever been framed — so a live event that starts with no route
  // still gets a sensible view once the first rider fix arrives.
  const framedRef = useRef(false);

  // The Leaflet instance is created EXACTLY ONCE and never rebuilt — not on a poll, not on a
  // prop change. A wide holding view until the route/riders effects below frame it for real.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
    mapRef.current = map;
    L.tileLayer(config.tileUrl, { attribution: config.tileAttribution, maxZoom: 19 }).addTo(map);
    map.setView([20, 0], 2);
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Route line + start/finish markers — drawn reactively so a route that loads AFTER the map
  // mounts (the common case: results store resolves a tick later) still appears and still
  // frames the view. Keyed on identity so a same-length re-fetch with the same points is a
  // no-op; a real route only ever arrives once per live event.
  const routeKey =
    routePoints.length > 0 ? `${routePoints.length}:${routePoints[0].join(",")}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: routeKey is the intentional identity gate for routePoints
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routePoints.length === 0) return;
    const layers: L.Layer[] = [];
    if (routePoints.length > 1) {
      layers.push(L.marker(routePoints[0], { icon: startIcon(0) }).bindTooltip("Start"));
      layers.push(
        L.marker(routePoints[routePoints.length - 1], { icon: finishIcon() }).bindTooltip("Finish"),
      );
      // Base line = the whole route, kept deliberately light — the travelled overlay below
      // draws the "done" portion darker on top of it.
      layers.push(L.polyline(routePoints, { color: "#63a6fc", weight: 3, opacity: 0.45 }));
    }
    for (const layer of layers) layer.addTo(map);
    if (!framedRef.current) {
      framedRef.current = true;
      if (routePoints.length > 1) {
        map.fitBounds(L.latLngBounds(routePoints), { padding: [28, 28] });
      } else {
        map.setView(routePoints[0], 13);
      }
    }
    return () => {
      for (const layer of layers) layer.remove();
    };
  }, [routeKey]);

  // Riders with a real fix. A rider still waiting for their first point is never drawn.
  const positioned = riders.filter(
    (r): r is LiveRider & { lat: number; lng: number } => r.lat != null && r.lng != null,
  );
  const displayed = showOthers ? positioned : [];

  // First-view fallback for a route-less event: once we have any positioned rider (or the
  // viewer's own dot) and nothing has framed the map yet, fit to what we have — once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || framedRef.current) return;
    const pts: [number, number][] = positioned.map((r) => [r.lat, r.lng]);
    if (selfPosition) pts.push(selfPosition);
    if (pts.length === 0) return;
    framedRef.current = true;
    if (pts.length === 1) map.setView(pts[0], 14);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [positioned, selfPosition]);

  // --- one-shot recenter (Center control / initial self-framing) -------------------------
  // Depends only on `recenter` — the parent bumps `nonce` when it wants a recenter. Route and
  // self position are read via refs so this never re-runs (and never re-pans) on a poll tick;
  // a manually panned map stays put.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recenter.nonce === 0) return;
    const self = selfPositionRef.current;
    const route = routePointsRef.current;
    if (recenter.mode === "self" && self) {
      map.panTo(self); // keep the current zoom
    } else if (route.length > 1) {
      map.fitBounds(L.latLngBounds(route), { padding: [28, 28] });
    } else if (route.length === 1) {
      map.setView(route[0], 13);
    } else if (self) {
      map.panTo(self);
    }
  }, [recenter]);

  // --- travelled-route overlay ----------------------------------------------------------
  // The creator's own progress: project their real GPS onto the polyline and redraw the
  // "done" portion darker. Never a straight line — `nearestPointOnRoute` walks the segments.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routePoints.length < 2 || !selfPosition) return;
    const { index, point } = nearestPointOnRoute(routePoints, selfPosition);
    if (index < 0) return;
    const travelled: [number, number][] = [...routePoints.slice(0, index + 1), point];
    const line = L.polyline(travelled, {
      color: "#1d4ed8",
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
    }).addTo(map);
    return () => {
      line.remove();
    };
  }, [selfPosition, routePoints]);

  // --- per-OTHER-rider travelled overlay (unchanged behaviour) --------------------------
  // A lighter green "how far has this rider gotten" hint, from their server odometer. The
  // viewer's own participant id is skipped — they get the dark GPS-projected overlay above.
  // Heavy for a long route (haversine per vertex) and the route never changes underneath a
  // live event — compute it once per route, not once per poll tick.
  // biome-ignore lint/correctness/useExhaustiveDependencies: routeKey is the identity gate for routePoints
  const cumulativeRoute = useMemo(
    () => (routePoints.length > 1 ? cumulativeDistanceKm(routePoints) : []),
    [routeKey],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || routePoints.length < 2) return;
    const cumulative = cumulativeRoute;
    const segments = displayed
      .filter(
        (r) => r.participantId !== selfParticipantId && r.distanceKm != null && r.distanceKm > 0,
      )
      .map((r) => {
        const idx = nearestIndexForDistance(cumulative, r.distanceKm as number);
        if (idx < 1) return null;
        return L.polyline(routePoints.slice(0, idx + 1), {
          color: "#3edda4",
          weight: 4,
          opacity: 0.7,
        }).addTo(map);
      })
      .filter((line): line is L.Polyline => line !== null);
    return () => {
      for (const line of segments) line.remove();
    };
  }, [displayed, routePoints, cumulativeRoute, selfParticipantId]);

  // --- rider markers ------------------------------------------------------------------
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

  // Re-pan only when the SELECTION changes (a deliberate user action), not on every poll tick.
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
