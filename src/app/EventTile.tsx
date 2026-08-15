/**
 * A single tile in the "My Rides" horizontal row on the home screen — full-bleed style,
 * ported from Figma (new-commissaire, "Today" > Card/1 & Card/2), replacing the small
 * vertical race-pwa-style RaceTile this used to be. No cover-image field exists on an event
 * yet, so the "photo" is the same deterministic colour+initial placeholder EventCard uses,
 * not a fake stock image.
 *
 * Two departures from the mock, both deliberate: the top bar is a blinking "Live" indicator,
 * not a "Manage" shortcut, and shows on ANY live ride in My Rides — organizing or joined —
 * not just the owner's, so a live ride you joined catches the eye just as fast as one you're
 * running (asked for directly: "live ride ... has to be at top in some blinking so i can get
 * in fast"). A small heart button also stays in the corner, because without one nowhere in
 * the app could ever set a favourite for the "favourites only" filter in EventsListPage's
 * See-All view to show anything.
 *
 * An Organizing/Joined role tag lived here briefly — pulled after a look at real data made
 * clear why it wasn't working: every event this rider actually owns still says "Organizing"
 * on every single card, so the tag never contrasts against anything and reads as noise, not
 * signal. Revisit only alongside a real mix of organizing + joined rides to check against.
 */

import { Heart, Mountain, Ruler } from "lucide-react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { EventSummary } from "../lib/local-db";
import { formatLocalMonthYear } from "../lib/time";
import styles from "./EventTile.module.css";
import { initialOf, placeholderColorVar } from "./event-visuals";

interface EventTileProps {
  event: EventSummary;
  onToggleFavorite?: (id: string) => void;
}

export function EventTile({ event, onToggleFavorite }: EventTileProps) {
  function handleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(event.id);
  }

  return (
    <Link to={`/events/${event.id}`} className={styles.tile}>
      <div className={styles.bg} style={{ background: placeholderColorVar(event.id) }}>
        <span className={styles.initial}>{initialOf(event.name)}</span>
      </div>
      <div className={styles.scrim} />

      {event.status === "live" && (
        <span className={styles.liveBar}>
          <span className={styles.liveDot} aria-hidden="true" />
          Live
        </span>
      )}

      {onToggleFavorite && (
        <button
          type="button"
          className={event.favorite ? `${styles.favBtn} ${styles.favActive}` : styles.favBtn}
          onClick={handleFavorite}
          aria-label={event.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            width={13}
            height={13}
            fill={event.favorite ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>
      )}

      <div className={styles.info}>
        <div className={styles.name}>{event.name}</div>
        <div className={styles.metaRow}>
          {event.distanceKm != null && (
            <span className={styles.metaItem}>
              <Ruler className={styles.metaIcon} aria-hidden="true" />
              {event.distanceKm} km
            </span>
          )}
          {event.climbM != null && (
            <span className={styles.metaItem}>
              <Mountain className={styles.metaIcon} aria-hidden="true" />
              {event.climbM} m
            </span>
          )}
        </div>
        <div className={styles.metaRow}>
          {event.startsAt && (
            <span className={`${styles.metaItem} ${styles.dateItem}`}>
              {formatLocalMonthYear(event.startsAt)}
            </span>
          )}
          {event.location && <span className={styles.metaItem}>{event.location}</span>}
        </div>
      </div>
    </Link>
  );
}
