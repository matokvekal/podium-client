/**
 * The Route Builder's map — a picture of the draft, never its source of truth.
 *
 * Why not RouteMap: that component rebuilds its whole map whenever the points change and draws
 * nothing for an empty route. Here the map is created once and every layer is updated in place
 * (a marker keyed by waypoint id, a line keyed by segment id), so dragging a point or a routing
 * answer arriving moves one marker and redraws one or two lines — the map never blinks.
 *
 * Gestures, chosen for a finger first:
 *   - tap the map        → add a point at the end
 *   - drag a point       → move it (Leaflet stops the map panning while a marker is dragged)
 *   - tap a point        → select it (actions appear in the page's bottom bar)
 *   - tap the line       → add a point there (a wide invisible line makes it easy to hit)
 *   - drag the line      → a new point where it was grabbed, moved to where it is let go
 * Double-tap zoom is off: a quick double tap would otherwise add two points AND zoom.
 *
 * A via point is drawn where its routed line actually meets the road (the router snaps a tap
 * near a road onto it), so the marker sits on the road, not 20 m beside it. Start and finish
 * stay exactly where the rider put them.
 *
 * Lazy-loaded by RouteBuilderPage like every Leaflet map here (see RouteMap.tsx's header for
 * what an eager Leaflet import costs the bundle).
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { config } from "../lib/config";
import type { LatLng, RouteDraft, RouteSegment } from "./model";
import styles from "./RouteBuilderPage.module.css";

export interface MapFocus {
  /** Changes on every request, so asking for the same place twice still moves the map. */
  nonce: number;
  point: LatLng;
  /** [south, north, west, east] when the place has an extent (a city, a country). */
  bbox?: [number, number, number, number];
}

export interface MapView {
  center: LatLng;
  zoom: number;
  bounds: [LatLng, LatLng];
}

interface BuilderMapProps {
  draft: RouteDraft;
  selectedId: string | null;
  initialView: { center: LatLng; zoom: number } | null;
  focus: MapFocus | null;
  routingAttribution: boolean;
  onMapTap(position: LatLng): void;
  onWaypointTap(id: string): void;
  onWaypointMoved(id: string, position: LatLng): void;
  onSegmentTap(segmentId: string, position: LatLng): void;
  onSegmentDragged(segmentId: string, grab: LatLng, drop: LatLng): void;
  onViewChange(view: MapView): void;
}

/** Israel, wide enough to show the whole country on a phone. */
const DEFAULT_VIEW = { center: [31.5, 34.95] as LatLng, zoom: 8 };
/** A search result is never zoomed in closer than this — enough roads around it to plan. */
const FOCUS_MAX_ZOOM = 14;

const COLORS = {
  routed: "#2563eb",
  manual: "#f59e0b",
  imported: "#7c3aed",
  pending: "#94a3b8",
  error: "#e5484d",
};

function lineStyle(seg: RouteSegment): L.PolylineOptions {
  if (seg.status === "pending") {
    return {
      color: COLORS.pending,
      weight: 4,
      opacity: 0.9,
      dashArray: "6 8",
      className: "rb-pending",
    };
  }
  if (seg.status === "error") {
    return { color: COLORS.error, weight: 4, opacity: 0.95, dashArray: "6 8", className: "" };
  }
  if (seg.mode === "manual") {
    return {
      color: COLORS.manual,
      weight: 5,
      opacity: 0.95,
      dashArray: "1 10",
      lineCap: "round",
      className: "",
    };
  }
  return { color: COLORS[seg.mode], weight: 5, opacity: 0.9, dashArray: undefined, className: "" };
}

type WaypointKind = "start" | "via" | "finish";

function waypointIcon(kind: WaypointKind, label: string, selected: boolean): L.DivIcon {
  const size = selected ? 30 : 24;
  const color = kind === "start" ? "#16a34a" : kind === "finish" ? "#111827" : "#ffffff";
  const text = kind === "via" ? "#2563eb" : "#ffffff";
  const ring = selected ? "0 0 0 4px rgba(37,99,235,.45)," : "";
  const body =
    kind === "finish"
      ? "🏁"
      : kind === "start"
        ? `<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,0 10,5 2,10" fill="#fff"/></svg>`
        : label;
  // A 40 px hit box around a smaller dot: easy to grab with a finger, light on the map.
  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:${text};border:2px solid ${kind === "via" ? "#2563eb" : "#fff"};box-shadow:${ring}0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui,sans-serif;">${body}</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/** Where a via point is drawn: the routed line's own end there (on the road), else where the
 *  rider put it — while routing is pending, after an error, or on a straight line. */
function onRoadPosition(draft: RouteDraft, index: number): LatLng {
  const isRoad = (s: RouteSegment | undefined) =>
    s?.mode === "routed" && s.status === "ready" && s.geometry.length > 1;
  const out = draft.segments[index];
  if (isRoad(out)) return out.geometry[0];
  const into = draft.segments[index - 1];
  if (isRoad(into)) return into.geometry[into.geometry.length - 1];
  return draft.waypoints[index].position;
}

/** Below this many pixels a press on the line is a tap (add a point), not a drag. */
const LINE_DRAG_THRESHOLD_PX = 8;

/**
 * A press on a segment's line. Once it moves past the threshold the map stops panning and a
 * dashed guide runs from the segment's start, through the finger, to its end; letting go
 * reports grab + drop. A segment still waiting for the router cannot be dragged (there is no
 * line on the road to grab yet).
 */
function startLineDrag(
  map: L.Map,
  down: PointerEvent,
  segmentId: string,
  propsRef: { current: BuilderMapProps },
  suppressClickRef: { current: boolean },
): void {
  if (down.pointerType === "mouse" && down.button !== 0) return;
  const { draft } = propsRef.current;
  const index = draft.segments.findIndex((s) => s.id === segmentId);
  if (index === -1 || draft.segments[index].status !== "ready") return;
  const from = onRoadOrStart(draft, index);
  const to = onRoadOrStart(draft, index + 1);
  const grab = map.mouseEventToLatLng(down);

  // Keep the map still from the first touch: a press that turns into a drag must not pan.
  down.stopPropagation();
  map.dragging.disable();
  let guide: L.Polyline | null = null;
  let handle: L.CircleMarker | null = null;

  const toLatLng = (e: PointerEvent): LatLng => {
    const p = map.mouseEventToLatLng(e);
    return [p.lat, p.lng];
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== down.pointerId) return;
    if (!guide) {
      const moved = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY);
      if (moved < LINE_DRAG_THRESHOLD_PX) return;
      guide = L.polyline([], {
        color: COLORS.routed,
        weight: 3,
        opacity: 0.8,
        dashArray: "6 8",
        interactive: false,
      }).addTo(map);
      handle = L.circleMarker(grab, {
        radius: 9,
        color: COLORS.routed,
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    }
    const at = toLatLng(e);
    guide.setLatLngs([from, at, to]);
    handle?.setLatLng(at);
  };
  const finish = (e: PointerEvent, commit: boolean) => {
    if (e.pointerId !== down.pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    map.dragging.enable();
    if (!guide) return; // never moved: a tap, which the line's click handler takes
    guide.remove();
    handle?.remove();
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 300);
    if (commit) propsRef.current.onSegmentDragged(segmentId, [grab.lat, grab.lng], toLatLng(e));
  };
  const onUp = (e: PointerEvent) => finish(e, true);
  const onCancel = (e: PointerEvent) => finish(e, false);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
}

/** The ends of the dashed drag guide: on the road for a via point, as placed for start/finish. */
function onRoadOrStart(draft: RouteDraft, index: number): LatLng {
  const last = draft.waypoints.length - 1;
  return index === 0 || index === last ? draft.waypoints[index].position : onRoadPosition(draft, index);
}

export default function BuilderMap(props: BuilderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; iconKey: string }>());
  const linesRef = useRef(new Map<string, { line: L.Polyline; hit: L.Polyline }>());
  const draggingRef = useRef<string | null>(null);
  /** True for a moment after a line drag, so the click that ends it does not add a point too. */
  const suppressClickRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { draft, initialView } = propsRef.current;
    const map = L.map(el, { zoomControl: false, doubleClickZoom: false });
    L.tileLayer(config.tileUrl, { attribution: config.tileAttribution, maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const allPoints = draft.segments.flatMap((s) => s.geometry);
    if (allPoints.length === 0 && draft.waypoints.length > 0)
      allPoints.push(draft.waypoints[0].position);
    if (allPoints.length > 1) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [48, 48] });
    } else if (allPoints.length === 1) {
      map.setView(allPoints[0], 14);
    } else {
      const view = initialView ?? DEFAULT_VIEW;
      map.setView(view.center, view.zoom);
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      propsRef.current.onMapTap([e.latlng.lat, e.latlng.lng]);
    });
    const reportView = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      propsRef.current.onViewChange({
        center: [c.lat, c.lng],
        zoom: map.getZoom(),
        bounds: [
          [b.getSouth(), b.getWest()],
          [b.getNorth(), b.getEast()],
        ],
      });
    };
    map.on("moveend", reportView);
    reportView();

    mapRef.current = map;
    const markers = markersRef.current;
    const lines = linesRef.current;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      lines.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.attributionControl.removeAttribution("Routing © BRouter");
    if (props.routingAttribution) map.attributionControl.addAttribution("Routing © BRouter");
  }, [props.routingAttribution]);

  // Segments: one visible line and one wide invisible tap target each.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const lines = linesRef.current;
    const live = new Set<string>();
    for (const seg of props.draft.segments) {
      live.add(seg.id);
      const style = lineStyle(seg);
      const existing = lines.get(seg.id);
      if (existing) {
        existing.line.setLatLngs(seg.geometry);
        existing.line.setStyle(style);
        // className is fixed at creation in Leaflet; the pending shimmer is toggled directly.
        existing.line.getElement()?.classList.toggle("rb-pending", seg.status === "pending");
        existing.hit.setLatLngs(seg.geometry);
        continue;
      }
      const line = L.polyline(seg.geometry, { ...style, interactive: false }).addTo(map);
      const hit = L.polyline(seg.geometry, {
        color: "#000",
        opacity: 0,
        weight: 26,
        interactive: true,
      }).addTo(map);
      const id = seg.id;
      hit.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (suppressClickRef.current) return;
        propsRef.current.onSegmentTap(id, [e.latlng.lat, e.latlng.lng]);
      });
      (hit.getElement() as SVGElement | undefined)?.addEventListener("pointerdown", (e) =>
        startLineDrag(map, e, id, propsRef, suppressClickRef),
      );
      lines.set(seg.id, { line, hit });
    }
    for (const [id, { line, hit }] of lines) {
      if (live.has(id)) continue;
      line.remove();
      hit.remove();
      lines.delete(id);
    }
  }, [props.draft.segments]);

  // Waypoints.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const { waypoints } = props.draft;
    const live = new Set<string>();
    waypoints.forEach((wp, i) => {
      live.add(wp.id);
      const kind: WaypointKind = i === 0 ? "start" : i === waypoints.length - 1 ? "finish" : "via";
      const selected = wp.id === props.selectedId;
      const iconKey = `${kind}|${i}|${selected}`;
      const shown = kind === "via" ? onRoadPosition(props.draft, i) : wp.position;
      const existing = markers.get(wp.id);
      if (existing) {
        if (draggingRef.current !== wp.id) existing.marker.setLatLng(shown);
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(waypointIcon(kind, String(i), selected));
          existing.marker.setZIndexOffset(kind === "start" ? 500 : selected ? 1000 : 0);
          existing.iconKey = iconKey;
        }
        return;
      }
      const marker = L.marker(shown, {
        icon: waypointIcon(kind, String(i), selected),
        draggable: true,
        autoPan: true,
        zIndexOffset: kind === "start" ? 500 : 0,
        keyboard: false,
      }).addTo(map);
      const id = wp.id;
      marker.on("click", () => propsRef.current.onWaypointTap(id));
      marker.on("dragstart", () => {
        draggingRef.current = id;
      });
      marker.on("dragend", () => {
        draggingRef.current = null;
        const p = marker.getLatLng();
        propsRef.current.onWaypointMoved(id, [p.lat, p.lng]);
      });
      markers.set(wp.id, { marker, iconKey });
    });
    for (const [id, { marker }] of markers) {
      if (live.has(id)) continue;
      marker.remove();
      markers.delete(id);
    }
  }, [props.draft, props.selectedId]);

  // Search results and "locate me".
  useEffect(() => {
    const map = mapRef.current;
    const focus = props.focus;
    if (!map || !focus) return;
    if (focus.bbox) {
      const [south, north, west, east] = focus.bbox;
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [56, 56], maxZoom: FOCUS_MAX_ZOOM },
      );
    } else {
      map.setView(focus.point, FOCUS_MAX_ZOOM);
    }
  }, [props.focus]);

  return <div ref={containerRef} className={styles.map} data-testid="route-builder-map" />;
}
