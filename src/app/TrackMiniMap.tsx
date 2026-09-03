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
import { thinPoints } from "./track-thumbnail";

/** Points kept per card map. See the thinning note in the effect for why this is not 3,000. */
const MAP_POINT_TARGET = 400;

interface TrackMiniMapProps {
  points: [number, number][];
  /** Announced to screen readers, since the map itself is a picture to them. */
  label: string;
}

export default function TrackMiniMap({ points, label }: TrackMiniMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [wheelEnabled, setWheelEnabled] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || points.length === 0) return;

    const drawPoints = thinPoints(points, MAP_POINT_TARGET);

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

    // THINNED before Leaflet ever sees it. A saved route here carries ~3,000 points, and
    // Leaflet draws a polyline as a single SVG path with every one of them in its `d`
    // attribute — on a card a couple of hundred pixels wide, where most land on a pixel that
    // is already painted. With several maps alive at once that is megabytes of path data and a
    // lot of geometry work for a difference nobody can see. 400 points keeps the shape at this
    // size and cuts the per-map cost by roughly 8x.
    const line = L.polyline(drawPoints, { color: "#3f86e7", weight: 4, opacity: 0.95 }).addTo(map);
    // A white casing under the line, so it reads over both pale fields and dark forest tiles.
    L.polyline(drawPoints, { color: "#ffffff", weight: 7, opacity: 0.7 }).addTo(map).bringToBack();

    const heading = drawPoints.length > 1 ? bearingDeg(drawPoints[0], drawPoints[1]) : 0;
    L.marker(drawPoints[0], { icon: startIcon(heading), interactive: false }).addTo(map);
    L.marker(drawPoints[drawPoints.length - 1], { icon: finishIcon(), interactive: false }).addTo(
      map,
    );

    map.fitBounds(line.getBounds(), { padding: [18, 18] });

    // Leaflet mis-measures inside a flex/grid container until told to re-check its size, but
    // the callback MUST be cancelled on unmount. These maps are windowed — they mount and
    // unmount continuously as the gallery scrolls — so without this, a card scrolled past
    // within one frame of mounting runs invalidateSize() on a map that map.remove() has
    // already torn down, which throws out of a requestAnimationFrame callback where no error
    // boundary can catch it.
    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      mapRef.current = null;
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
      ref={wrapperRef}
      className={styles.map}
      role="application"
      aria-label={`Map of ${label}`}
      onMouseEnter={() => setWheelEnabled(true)}
      onMouseLeave={() => setWheelEnabled(false)}
    />
  );
}
