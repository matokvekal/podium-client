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

import { Heart, Mountain, Pencil, Ruler, Users } from "lucide-react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { seedParticipantCount } from "../lib/mock-participants";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL } from "../lib/mock-tracks";
import { LEVEL_LABEL, LEVELS } from "../lib/rider-level";
import { formatLocalMonthYear } from "../lib/time";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import styles from "./EventTile.module.css";
import {
  figmaStatus,
  initialOf,
  mockLevel,
  placeholderColorVar,
  recordOpenedEvent,
} from "./event-visuals";

interface EventTileProps {
  event: EventSummary;
  onToggleFavorite?: (id: string) => void;
  isNew?: boolean;
  justOpened?: boolean;
}

export function EventTile({
  event,
  onToggleFavorite,
  isNew,
  justOpened,
}: EventTileProps) {
  function handleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(event.id);
  }

  const { profile } = useAuth();
  const navigate = useNavigate();
  // Same "upcoming, and mine" rule as EventCard.tsx's canEdit.
  const canEdit =
    figmaStatus(event.status) === "upcoming" &&
    profile != null &&
    profile.id === event.ownerId;

  // Same data + fallbacks EventCard.tsx shows in the See-All list, so a ride reads the same
  // whether it's here in the home row or there.
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const extras = getEventExtras(extrasByEvent, event.id);
  const level = extras.level ?? mockLevel(event.id);
  const levelIndex = LEVELS.findIndex((l) => l.value === level);
  const activityType = extras.activityType ?? "road";
  const TypeIcon = SURFACE_TYPE_ICON[activityType];
  const riderCount = seedParticipantCount(event.id);

  function handleEdit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/events/${event.id}/edit`);
  }

  return (
    <Link
      to={`/events/${event.id}`}
      className={styles.tile}
      data-new={isNew || justOpened || undefined}
      onClick={() => recordOpenedEvent(event.id)}
    >
      <div
        className={styles.bg}
        style={{ background: placeholderColorVar(event.id) }}
      >
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
          className={
            event.favorite
              ? `${styles.favBtn} ${styles.favActive}`
              : styles.favBtn
          }
          onClick={handleFavorite}
          aria-label={
            event.favorite ? "Remove from favorites" : "Add to favorites"
          }
        >
          <Heart
            width={13}
            height={13}
            fill={event.favorite ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          className={styles.editBtn}
          onClick={handleEdit}
          aria-label="Edit ride"
          title="Edit ride"
        >
          <Pencil width={13} height={13} aria-hidden="true" />
        </button>
      )}

      <div className={styles.info}>
        <div className={styles.name}>{event.name}</div>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <Users className={styles.metaIcon} aria-hidden="true" />
            {riderCount}
          </span>
          {/* Same read-only "stairs" as EventDetailPage.tsx/EventCard.tsx's difficulty
              display — asked for directly ("dificalty icons stairs it important"). */}
          <span className={styles.levelBars} title={LEVEL_LABEL[level]}>
            {LEVELS.map((l, i) => (
              <span
                key={l.value}
                className={styles.levelBar}
                data-level={l.value}
                data-filled={i === levelIndex}
                style={{ height: `${5 + i * 3}px` }}
              />
            ))}
          </span>
          <span
            className={styles.metaItem}
            title={SURFACE_TYPE_LABEL[activityType]}
          >
            <TypeIcon className={styles.metaIcon} aria-hidden="true" />
          </span>
        </div>
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
          {event.location && (
            <span className={styles.metaItem}>{event.location}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
