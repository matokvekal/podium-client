/**
 * One track in the gallery, presented the way a trip is presented in a catalogue: a real map
 * of where it goes, the name big enough to read at a glance, the area, then the numbers that
 * decide whether a rider wants it.
 *
 * THE MAP IS A REAL MAP. Earlier this card drew only an SVG line on a coloured ground, which
 * showed the shape of a route but not where on earth it was — you could not tell a coast road
 * from a forest track, or recognise your own town. It is now a live OpenStreetMap map you can
 * pan and zoom (TrackMiniMap), windowed so only the cards on screen hold one; see that file
 * for how that stays affordable in a list of thousands.
 *
 * The SVG line survives as the INSTANT UNDERLAY beneath the map: it paints from geometry
 * already in memory before a single tile has been requested, so the card shows the real route
 * immediately instead of a grey hole, and a rider whose tiles never arrive still sees it.
 *
 * WHAT THE NUMBERS ARE, AND WHY EACH IS REAL:
 *
 *   distance / climb  the route's own measured figures, falling back to the organizer's typed
 *                     ones until the geometry arrives.
 *   ride time         events.duration_min — the organizer's own estimate. NOT derived from
 *                     distance: lib/ride-duration.ts is explicit that inventing one needs an
 *                     assumed speed, which this app does not ship. Shown as "Not stated"
 *                     rather than omitted, so the rows stay aligned down the grid.
 *   downloads         how many rides have been built on this track, counted from event_routes
 *                     (server: usedByRides). A real reuse count, not a view counter. Absent on
 *                     a server that has not shipped it yet, in which case it does not render.
 *   riders            participantCount — how many people actually rode it.
 */

import { ArrowDownToLine, Clock, MapPin, Mountain, Route as RouteIcon, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { EventRoute } from "../lib/event-route";
import type { EventSummary } from "../lib/local-db";
import { formatDuration } from "../lib/ride-duration";
import { placeholderCoverGradient } from "./event-visuals";
import styles from "./TrackGalleryCard.module.css";
import { projectTrack } from "./track-thumbnail";

// Leaflet must never reach the main bundle — it takes it from 65 kB to 559 kB. Every consumer
// stays lazy, this one included.
const TrackMiniMap = lazy(() => import("./TrackMiniMap"));

/** The underlay's coordinate space. Rendered via viewBox, so these are ratios as much as px. */
const THUMB_W = 320;
const THUMB_H = 150;
const THUMB_PAD = 12;

/** How far outside the viewport a card still keeps its live map. One screen of margin means
 * the map is ready before the card is looked at, without holding maps for the whole list. */
const MAP_ROOT_MARGIN = "250px";

interface TrackGalleryCardProps {
  event: EventSummary;
  route: EventRoute | null | undefined;
  /** How many rides were built on this track. Undefined when the server does not report it. */
  usedByRides?: number;
  /** Fired once the card is near the viewport, so its route can be fetched then and not before. */
  onVisible: (eventId: string) => void;
  onPick: (event: EventSummary) => void;
}

export function TrackGalleryCard({
  event,
  route,
  usedByRides,
  onVisible,
  onPick,
}: TrackGalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  /** Whether this card currently holds a live Leaflet map. Drives the windowing. */
  const [mapLive, setMapLive] = useState(false);

  // One observer does both jobs: ask for the geometry, and mount/unmount the map. They share a
  // trigger because they answer the same question — is this card worth spending on right now.
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        setMapLive(visible);
        // requestRoute ignores a repeat for geometry it holds or is fetching, so re-entering
        // costs nothing — but after a FAILED fetch nothing was cached, and this is what lets
        // scrolling back to the card try again rather than leaving it blank for good.
        if (visible) onVisible(event.id);
      },
      { rootMargin: MAP_ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [event.id, onVisible]);

  const projected = useMemo(
    () => (route ? projectTrack(route.points, THUMB_W, THUMB_H, THUMB_PAD) : null),
    [route],
  );

  const distanceKm = route?.distanceKm ?? event.distanceKm;
  const climbM = route?.elevationM ?? event.elevationGain;
  const duration = formatDuration(event.durationMin);
  const riders = event.participantCount;
  const place = event.location ?? event.area;

  return (
    <div className={styles.card} ref={cardRef}>
      <div className={styles.media}>
        {/* The instant underlay. Always painted, always beneath — the map fades in over it. */}
        <div
          className={styles.underlay}
          style={{ background: placeholderCoverGradient(event.id) }}
          aria-hidden="true"
        >
          {projected && (
            <svg
              className={styles.underlaySvg}
              viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <polyline className={styles.trackCasing} points={projected.points} />
              <polyline className={styles.trackLine} points={projected.points} />
            </svg>
          )}
          {route === undefined && <span className="spinner" />}
        </div>

        {mapLive && route && route.points.length > 1 && (
          <div className={styles.mapLayer}>
            <Suspense fallback={null}>
              <TrackMiniMap points={route.points} label={event.name} />
            </Suspense>
          </div>
        )}

        {distanceKm != null && <span className={styles.mediaBadge}>{distanceKm} km</span>}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{event.name}</h3>

        {place && (
          <p className={styles.place}>
            <MapPin className={styles.placeIcon} aria-hidden="true" />
            {place}
          </p>
        )}

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>
              <Clock className={styles.statIcon} aria-hidden="true" />
              Ride time
            </dt>
            <dd className={duration ? styles.statValue : styles.statValueMuted}>
              {duration || "Not stated"}
            </dd>
          </div>

          <div className={styles.stat}>
            <dt className={styles.statLabel}>
              <Mountain className={styles.statIcon} aria-hidden="true" />
              Climb
            </dt>
            <dd className={climbM != null ? styles.statValue : styles.statValueMuted}>
              {climbM != null ? `${climbM} m` : "Not stated"}
            </dd>
          </div>

          {usedByRides != null && (
            <div className={styles.stat}>
              <dt className={styles.statLabel}>
                <ArrowDownToLine className={styles.statIcon} aria-hidden="true" />
                Downloads
              </dt>
              <dd className={styles.statValue}>{usedByRides}</dd>
            </div>
          )}

          {riders != null && riders > 0 && (
            <div className={styles.stat}>
              <dt className={styles.statLabel}>
                <Users className={styles.statIcon} aria-hidden="true" />
                Riders
              </dt>
              <dd className={styles.statValue}>{riders}</dd>
            </div>
          )}
        </dl>

        <button type="button" className={styles.useBtn} onClick={() => onPick(event)}>
          <RouteIcon width={16} height={16} aria-hidden="true" />
          Use this track
        </button>
      </div>
    </div>
  );
}
