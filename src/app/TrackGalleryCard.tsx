/**
 * One track in the gallery, presented the way a trip is presented in a catalogue: the name
 * big enough to read at a glance, the area under it, a picture of the route, then the four
 * numbers that decide whether a rider wants it.
 *
 * WHAT IS ON THE CARD, AND WHY EACH IS REAL:
 *
 *   name / area       the ride's own name and location — the two fields an organizer always
 *                     fills in, and the only ones a rider actually recognises.
 *   the route picture  an SVG polyline of the real saved track (see track-thumbnail.ts for why
 *                     this is not a Leaflet map).
 *   distance / climb  the organizer's figures, auto-filled from the track when it was saved.
 *   time              events.durationMin — the organizer's own estimate. NOT derived from
 *                     distance: lib/ride-duration.ts is explicit that inventing one would need
 *                     an assumed speed, which this app does not ship. A ride with no stated
 *                     duration simply has no time on its card.
 *   riders            participantCount. This is the "how popular is this" number; there is no
 *                     download counter anywhere in this product and nothing downloads a track
 *                     file, so a real count of people who rode it is the honest version.
 *
 * Every one of them renders only when the server sent a value, so a sparse ride degrades to a
 * smaller card rather than a card full of dashes — the same rule TrackCard states.
 */

import { Clock, MapPin, Mountain, Ruler, Users } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { EventRoute } from "../lib/event-route";
import type { EventSummary } from "../lib/local-db";
import { formatDuration } from "../lib/ride-duration";
import { placeholderCoverGradient } from "./event-visuals";
import styles from "./TrackGalleryCard.module.css";
import { projectTrack } from "./track-thumbnail";

/** The thumbnail's coordinate space. Rendered responsively via viewBox, so these are ratios
 * as much as pixels — 5:2 is wide enough to show a route's shape without eating the card. */
const THUMB_W = 320;
const THUMB_H = 128;
const THUMB_PAD = 10;

interface TrackGalleryCardProps {
  event: EventSummary;
  route: EventRoute | null | undefined;
  /** Fired once the card is near the viewport, so its route can be fetched then and not before. */
  onVisible: (eventId: string) => void;
  onPick: (event: EventSummary) => void;
}

export function TrackGalleryCard({ event, route, onVisible, onPick }: TrackGalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Ask for the geometry only when the card is about to be seen. rootMargin gives it a screen
  // of warning so the line is usually drawn by the time the card is actually looked at.
  //
  // It deliberately keeps observing after firing instead of disconnecting itself. requestRoute
  // already ignores a repeat for a route it holds or is fetching, so re-entering the viewport
  // costs nothing in the normal case — but when a fetch FAILED, nothing was cached, and this is
  // what lets scrolling back to the card try again rather than leaving it blank for good.
  useEffect(() => {
    const node = cardRef.current;
    if (!node || route !== undefined) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible(event.id);
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [event.id, onVisible, route]);

  const projected = useMemo(
    () => (route ? projectTrack(route.points, THUMB_W, THUMB_H, THUMB_PAD) : null),
    [route],
  );

  const distanceKm = route?.distanceKm ?? event.distanceKm;
  const climbM = route?.elevationM ?? event.elevationGain;
  const duration = formatDuration(event.durationMin);
  const riders = event.participantCount;

  return (
    <div className={styles.card} ref={cardRef}>
      <button type="button" className={styles.cardMain} onClick={() => onPick(event)}>
        <span className={styles.name}>{event.name}</span>

        {(event.location ?? event.area) && (
          <span className={styles.place}>
            <MapPin className={styles.placeIcon} aria-hidden="true" />
            {event.location ?? event.area}
          </span>
        )}

        {/* The gradient is the same deterministic per-event art EventCard uses for covers, so
            a card waiting on its route looks intentional rather than broken — and a route that
            genuinely cannot be drawn keeps the card's shape instead of collapsing it. */}
        <span
          className={styles.thumb}
          style={{ background: placeholderCoverGradient(event.id) }}
          aria-hidden="true"
        >
          {projected ? (
            <svg
              className={styles.thumbSvg}
              viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <title>{`Route of ${event.name}`}</title>
              {/* Drawn twice: a wide soft casing underneath so the line stays readable over
                  both the pale and the dark gradient moods, then the line itself. */}
              <polyline className={styles.trackCasing} points={projected.points} />
              <polyline className={styles.trackLine} points={projected.points} />
              <circle
                className={styles.startDot}
                cx={projected.start.x}
                cy={projected.start.y}
                r={5}
              />
              <circle className={styles.endDot} cx={projected.end.x} cy={projected.end.y} r={5} />
            </svg>
          ) : (
            <span className={styles.thumbPending}>
              {route === undefined ? <span className="spinner" /> : null}
            </span>
          )}
        </span>

        <span className={styles.stats}>
          {distanceKm != null && (
            <span className={styles.stat}>
              <Ruler className={styles.statIcon} aria-hidden="true" />
              {distanceKm} km
            </span>
          )}
          {climbM != null && (
            <span className={styles.stat}>
              <Mountain className={styles.statIcon} aria-hidden="true" />
              {climbM} m
            </span>
          )}
          {duration && (
            <span className={styles.stat}>
              <Clock className={styles.statIcon} aria-hidden="true" />
              {duration}
            </span>
          )}
          {riders != null && riders > 0 && (
            <span className={styles.stat}>
              <Users className={styles.statIcon} aria-hidden="true" />
              {riders} {riders === 1 ? "rider" : "riders"}
            </span>
          )}
        </span>

        <span className={styles.useBtn}>Use this track</span>
      </button>
    </div>
  );
}
