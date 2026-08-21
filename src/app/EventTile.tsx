/**
 * A single ride card on the home screen — "Upcoming" (one large card) and "Past Rides" (a
 * vertical list of compact cards), matching a reference screenshot supplied directly. Photo
 * header (date badge, status pill, favorite heart, the event's own name centered and large
 * over the gradient, organizer as a caption at the bottom) with a plain card body below it for
 * the stats/difficulty/date riders actually need to scan — previously all of that lived
 * crammed into the photo overlay itself. No cover-image field exists on an event yet, so the
 * "photo" is a two-tone gradient picked deterministically from the event's id (event-visuals.ts)
 * with the event name as its centerpiece instead of a lone initial letter — asked for directly
 * ("the cards ... black ... put the event name in the center instead of the letters"), not a
 * fake stock image. The previous full-bleed-tile version is kept at
 * src/_backup-cockpit-design/EventTile.tsx.bak.
 *
 * The "Live" bar (blinking, top-left of the photo) shows on ANY live ride in My Rides —
 * organizing or joined — not just the owner's, so a live ride you joined catches the eye just
 * as fast as one you're running (asked for directly: "live ride ... has to be at top in some
 * blinking so i can get in fast").
 */

import {
  CalendarDays,
  Heart,
  Mountain,
  Pencil,
  Ruler,
  Users,
} from "lucide-react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { seedParticipantCount } from "../lib/mock-participants";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL } from "../lib/mock-tracks";
import { LEVEL_LABEL, LEVELS } from "../lib/rider-level";
import { formatLocalDateTime } from "../lib/time";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import styles from "./EventTile.module.css";
import {
  figmaStatus,
  FIGMA_TAG_LABEL,
  mockLevel,
  mockOrganizerName,
  placeholderColorVar,
  recordOpenedEvent,
} from "./event-visuals";

interface EventTileProps {
  event: EventSummary;
  onToggleFavorite?: (id: string) => void;
  isNew?: boolean;
  justOpened?: boolean;
  /** "Upcoming" gets the large hero-style card; "Past Rides" gets the compact one — same
   * screenshot, two card sizes. Defaults to the large one. */
  compact?: boolean;
}

export function EventTile({
  event,
  onToggleFavorite,
  isNew,
  justOpened,
  compact,
}: EventTileProps) {
  function handleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(event.id);
  }

  const { profile } = useAuth();
  const navigate = useNavigate();
  const bucket = figmaStatus(event.status);
  // Same "upcoming, and mine" rule as EventCard.tsx's canEdit.
  const canEdit =
    bucket === "upcoming" && profile != null && profile.id === event.ownerId;

  // Same data + fallbacks EventCard.tsx shows in the See-All list, so a ride reads the same
  // wherever it appears.
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const extras = getEventExtras(extrasByEvent, event.id);
  const level = extras.level ?? mockLevel(event.id);
  const levelIndex = LEVELS.findIndex((l) => l.value === level);
  const activityType = extras.activityType ?? "road";
  const TypeIcon = SURFACE_TYPE_ICON[activityType];
  const organizer = extras.organizerGroup ?? mockOrganizerName(event.id);
  const riderCount = seedParticipantCount(event.id);
  // Same real-over-mock preference as EventCard.tsx's See-All row — see its comment.
  const distanceKm = extras.distanceKm ?? event.distanceKm ?? null;
  const climbM = extras.climbM ?? event.climbM ?? null;

  function handleEdit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/events/${event.id}/edit`);
  }

  return (
    <Link
      to={`/events/${event.id}`}
      className={compact ? styles.cardCompact : styles.card}
      data-new={isNew || justOpened || undefined}
      onClick={() => recordOpenedEvent(event.id)}
    >
      <div className={styles.photo}>
        <div
          className={styles.bg}
          style={{
            background: `linear-gradient(135deg, ${placeholderColorVar(event.id)} 0%, color-mix(in srgb, ${placeholderColorVar(event.id)} 55%, #05070c 45%) 100%)`,
          }}
        >
          {/* No real cover-image field exists yet (event-visuals.ts) — the event's own name,
              centered and large, stands in for one instead of an anonymous initial letter
              floating in the middle of a flat color block ("black... not nice... put the
              event name in the center instead of the letters," asked for directly). */}
          <span className={styles.heroName}>{event.name}</span>
        </div>
        <div className={styles.scrim} />

        <div className={styles.photoTop}>
          {event.startsAt ? (
            <span className={styles.dateBadge}>
              <span className={styles.dateBadgeMonth}>
                {dateBadgeMonth.format(new Date(event.startsAt))}
              </span>
              <span className={styles.dateBadgeDay}>
                {dateBadgeDay.format(new Date(event.startsAt))}
              </span>
            </span>
          ) : (
            <span />
          )}
          <div className={styles.photoTopRight}>
            {event.status === "live" ? (
              <span className={styles.liveBar}>
                <span className={styles.liveDot} aria-hidden="true" />
                Live
              </span>
            ) : (
              <span className={styles.statusPill} data-bucket={bucket}>
                {FIGMA_TAG_LABEL[bucket]}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                className={styles.photoIconBtn}
                onClick={handleEdit}
                aria-label="Edit ride"
                title="Edit ride"
              >
                <Pencil width={13} height={13} aria-hidden="true" />
              </button>
            )}
            {onToggleFavorite && (
              <button
                type="button"
                className={
                  event.favorite
                    ? `${styles.photoIconBtn} ${styles.favActive}`
                    : styles.photoIconBtn
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
          </div>
        </div>

        <div className={styles.photoBottom}>
          <div className={styles.organizerRow}>Organized by {organizer}</div>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <Users className={styles.metaIcon} aria-hidden="true" />
            {riderCount} Riders
          </span>
          {distanceKm != null && (
            <span className={styles.metaItem}>
              <Ruler className={styles.metaIcon} aria-hidden="true" />
              {distanceKm} km
            </span>
          )}
          {climbM != null && (
            <span className={styles.metaItem}>
              <Mountain className={styles.metaIcon} aria-hidden="true" />
              {climbM} m
            </span>
          )}
          {!compact && (
            /* Same read-only "stairs" as EventDetailPage.tsx/EventCard.tsx's difficulty
               display — asked for directly ("dificalty icons stairs it important"). */
            <span
              className={`${styles.levelBars} ${styles.metaRowSpacer}`}
              title={LEVEL_LABEL[level]}
            >
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
          )}
          {!compact && (
            <span
              className={styles.metaItem}
              title={SURFACE_TYPE_LABEL[activityType]}
            >
              <TypeIcon className={styles.metaIcon} aria-hidden="true" />
            </span>
          )}
        </div>
        {event.startsAt && (
          <div className={styles.metaItem}>
            <CalendarDays className={styles.metaIcon} aria-hidden="true" />
            {formatLocalDateTime(event.startsAt)}
          </div>
        )}
      </div>
    </Link>
  );
}

const dateBadgeMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
const dateBadgeDay = new Intl.DateTimeFormat(undefined, { day: "2-digit" });
