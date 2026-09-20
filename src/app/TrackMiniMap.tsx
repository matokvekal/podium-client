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
 * wheel while the pointer is over it and gives it straight back on leave.
 *
 * TOUCH HAS THE SAME TRAP, AND IT IS WORSE. On a phone the finger is the scroll gesture, so a
 * draggable map in a feed steals every swipe that happens to start on a card's picture — the
 * list stops dead and the map slides instead. There is no hover to key off, so the map starts
 * INERT to touch and is unlocked by a deliberate tap:
 *
 *   - `dragging` is off at construction on a touch device, and a transparent overlay sits over
 *     the map with `touch-action: pan-y`, so a vertical swipe scrolls the feed and never
 *     reaches Leaflet at all. A tap on that overlay enables dragging and removes it.
 *   - the unlock is per card and dies with it: these maps are windowed, so scrolling a card
 *     away destroys its map and the next time it appears it is locked again. No bookkeeping.
 *   - on a pointing device nothing changes — dragging is live from the start, because a mouse
 *     drag was never in competition with the scroll wheel.
 *
 * Double-click zoom, the zoom buttons and pinch-zoom stay live throughout: a pinch is a
 * two-finger gesture that no scroll can be mistaken for.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Hand } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../lib/config";
import { bearingDeg, finishIcon, startIcon } from "./map-icons";
import styles from "./TrackMiniMap.module.css";
import { thinPoints } from "./track-thumbnail";

/** Points kept per card map. See the thinning note in the effect for why this is not 3,000. */
const MAP_POINT_TARGET = 400;

/**
 * Whether this device drives the map with a finger. Read once per mount rather than stored
 * module-side, so a hybrid laptop that is being used as a tablet gets the right answer.
 *
 * `(hover: hover) and (pointer: fine)` is the mouse/trackpad case. Everything else — phones,
 * tablets, touchscreens — is treated as touch and gets the locked map.
 */
function prefersTouchInteraction(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

interface TrackMiniMapProps {
  points: [number, number][];
  /** Announced to screen readers, since the map itself is a picture to them. */
  label: string;
  /**
   * Called (at most once per mount) the first time the rider deliberately uses the map — taps
   * "Tap to explore" on a touch device, or presses on the map with a pointer (drag, zoom
   * buttons, double-click all begin with a press). This is the signal the gallery uses to fetch
   * the DETAILED line: a card is drawn from a 60-point preview, which is right for a glance and
   * angular once zoomed in. A rider who only scrolls past never triggers it.
   */
  onExplore?: () => void;
}

export default function TrackMiniMap({ points, label, onExplore }: TrackMiniMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // The layer group holding the route line and its two markers. Kept apart from the map so a new
  // line (the detailed one, once fetched) can replace it WITHOUT rebuilding the map — a rebuild
  // would throw away the rider's pan/zoom and re-lock a touch map they had just unlocked.
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const drawnRef = useRef<[number, number][] | null>(null);
  // Read from inside effects that must not re-run when the callback's identity changes.
  const onExploreRef = useRef(onExplore);
  onExploreRef.current = onExplore;
  const exploredRef = useRef(false);
  const notifyExplore = useCallback(() => {
    if (exploredRef.current) return;
    exploredRef.current = true;
    onExploreRef.current?.();
  }, []);
  const [wheelEnabled, setWheelEnabled] = useState(false);
  // Read once, on mount, and never changed — the map is constructed from it.
  const [isTouch] = useState(prefersTouchInteraction);
  const [touchUnlocked, setTouchUnlocked] = useState(false);

  // Draws (or redraws) the route line and its two markers into the layer group. Never touches
  // the view: the first draw follows a fitBounds in the effect below, and a later redraw (the
  // detailed line replacing the preview) must leave wherever the rider has panned to alone.
  const drawRoute = useCallback((group: L.LayerGroup, line: [number, number][]) => {
    group.clearLayers();
    drawnRef.current = line;
    if (line.length === 0) return;

    // THINNED before Leaflet ever sees it. Leaflet draws a polyline as a single SVG path with
    // every point in its `d` attribute; on a card a couple of hundred pixels wide most points
    // land on a pixel that is already painted. The gallery hands over a 60-point preview (or,
    // after a tap, the detailed line of a few hundred), so this is a backstop — it keeps a
    // hand-drawn 3,000-point route in SharedRidesPage cheap too.
    const drawPoints = thinPoints(line, MAP_POINT_TARGET);

    // The white casing is added FIRST and the coloured line second, so SVG paint order puts the
    // line on top on its own. That replaces a .bringToBack() call — the one that crashed — with
    // insertion order, which cannot be in the wrong state because there is no state to be in.
    L.polyline(drawPoints, { color: "#ffffff", weight: 7, opacity: 0.7 }).addTo(group);
    L.polyline(drawPoints, { color: "#3f86e7", weight: 4, opacity: 0.95 }).addTo(group);

    const heading = drawPoints.length > 1 ? bearingDeg(drawPoints[0], drawPoints[1]) : 0;
    L.marker(drawPoints[0], { icon: startIcon(heading), interactive: false }).addTo(group);
    L.marker(drawPoints[drawPoints.length - 1], {
      icon: finishIcon(),
      interactive: false,
    }).addTo(group);
  }, []);

  // The map is built once per mount from the points current at that moment, read through a ref
  // so a later change of `points` does not tear it down.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const initial = pointsRef.current;
    if (!wrapper || initial.length === 0) return;

    // Re-lock whenever the map is (re)built. A fresh L.map below starts with dragging off on a
    // touch device, so the React state has to agree — otherwise a re-used instance handed a
    // different track would show no "tap to explore" over a map that cannot actually be panned.
    setTouchUnlocked(false);

    // LEAFLET GETS A NODE REACT DOES NOT OWN. This is the fix for
    // "Cannot read properties of undefined (reading 'parentNode')", which crashed the gallery
    // on a real phone.
    //
    // Handing L.map() the div from JSX means React and Leaflet both manage the same element.
    // Leaflet fills it with panes, tile <img>s and control DOM; React, on unmount, detaches
    // that whole subtree. Whichever runs second finds nodes its bookkeeping still refers to
    // already gone, and Leaflet's teardown reads `.parentNode` off one of them. These maps
    // unmount constantly — they are windowed to the visible cards — so a race that a
    // page-lifetime map would hit approximately never happens here on every scroll.
    //
    // So React renders only the wrapper below and never looks inside it. The element Leaflet
    // is given is created here, appended here, and removed here. Ownership is unambiguous and
    // the two teardowns cannot interleave.
    const host = document.createElement("div");
    host.style.width = "100%";
    host.style.height = "100%";
    wrapper.appendChild(host);

    const map = L.map(host, {
      // Compact controls: a card is small, and a full zoom bar plus a long attribution line
      // would cover the route they are there to show.
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      // OFF on touch until the rider taps to unlock — see the box at the top of this file.
      // Live from the start with a mouse, where dragging never competed with scrolling.
      dragging: !isTouch,
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

    // THE VIEW IS SET BEFORE ANY LAYER IS ADDED, and the order matters — getting it wrong is
    // what threw "Cannot read properties of undefined (reading 'parentNode')" on every card.
    //
    // Map.addLayer calls layer.beforeAdd() SYNCHRONOUSLY (which sets layer._renderer) but then
    // defers the actual onAdd through map.whenReady(). A map with no view is not "ready", so
    // onAdd — and with it _initPath(), which creates layer._path — does not run yet. A layer in
    // that half-added state has a _renderer but no _path, so Path.bringToBack() sails past its
    // `if (this._renderer)` guard and hands undefined to the SVG renderer, which reads
    // .parentNode off it. fitBounds first means every layer below is added to a loaded map and
    // is fully initialised the moment addTo() returns.
    //
    // Bounds come from the points rather than from the polyline, precisely so no layer has to
    // exist before the view is set.
    const bounds = L.latLngBounds(thinPoints(initial, MAP_POINT_TARGET));
    map.fitBounds(bounds, { padding: [18, 18] });

    const group = L.layerGroup().addTo(map);
    routeLayerRef.current = group;
    drawRoute(group, initial);

    // Leaflet mis-measures inside a flex/grid container until told to re-check its size, but
    // the callback MUST be cancelled on unmount. These maps are windowed — they mount and
    // unmount continuously as the gallery scrolls — so without this, a card scrolled past
    // within one frame of mounting runs invalidateSize() on a map that map.remove() has
    // already torn down, which throws out of a requestAnimationFrame callback where no error
    // boundary can catch it.
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      // Re-fit once the container's real size is known. fitBounds above ran against whatever
      // Leaflet measured at construction, which inside a grid cell can be nothing at all.
      map.fitBounds(bounds, { padding: [18, 18] });
    });

    // A press on the map is the start of every deliberate use of it (drag, zoom buttons,
    // double-click). Capture phase, so it is seen before Leaflet's own handlers stop it.
    const onPress = () => notifyExplore();
    wrapper.addEventListener("pointerdown", onPress, true);

    return () => {
      wrapper.removeEventListener("pointerdown", onPress, true);
      cancelAnimationFrame(frame);
      mapRef.current = null;
      routeLayerRef.current = null;
      drawnRef.current = null;
      // Guarded, and NOT to paper over the ownership bug above — that is fixed by `host`.
      // Leaflet's teardown touches tile images that may still be in flight, and a throw here
      // is a throw inside an unmount cleanup, which React escalates by unmounting the whole
      // tree. A map being disposed of is not worth the entire app, so it is logged and the
      // node is dropped either way.
      try {
        map.remove();
      } catch (err) {
        console.warn("[TrackMiniMap] Leaflet teardown failed", err);
      }
      host.remove();
    };
  }, [isTouch, drawRoute, notifyExplore]);

  // A different line for the SAME map — the detailed geometry arriving after the rider explored.
  // Swaps the layers in place and leaves the view exactly where the rider put it.
  useEffect(() => {
    const group = routeLayerRef.current;
    if (!group || points.length === 0 || drawnRef.current === points) return;
    drawRoute(group, points);
  }, [points, drawRoute]);

  // The tap that hands the map over on a touch device. Separate from construction so unlocking
  // does not rebuild the map — the tiles already fetched stay fetched.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !touchUnlocked) return;
    map.dragging.enable();
    notifyExplore();
  }, [touchUnlocked, notifyExplore]);

  // The wheel handover described in the file comment.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (wheelEnabled) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [wheelEnabled]);

  const locked = isTouch && !touchUnlocked;

  return (
    <div className={styles.frame}>
      <div
        ref={wrapperRef}
        className={styles.map}
        role="application"
        aria-label={`Map of ${label}`}
        onMouseEnter={() => setWheelEnabled(true)}
        onMouseLeave={() => setWheelEnabled(false)}
      />
      {locked && (
        // `touch-action: pan-y` (in the stylesheet) is what makes this work: the browser keeps
        // vertical scrolling for itself and the overlay only ever sees a tap. Leaflet is
        // underneath and receives nothing at all until the tap lands.
        //
        // A real <button> so it is reachable by keyboard and announced — though a keyboard user
        // is on a pointing device and will never see it.
        <button
          type="button"
          className={styles.unlock}
          onClick={() => setTouchUnlocked(true)}
          aria-label={`Explore the map of ${label}`}
        >
          <span className={styles.unlockPill}>
            <Hand className={styles.unlockIcon} aria-hidden="true" />
            Tap to explore
          </span>
        </button>
      )}
    </div>
  );
}
