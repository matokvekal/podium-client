/**
 * A ride card in the My Rides / Find Rides lists.
 *
 * Rebuilt to the "all-events" reference design supplied directly (all-events.jpg). The previous
 * version is kept at src/_backup-pre-newui/EventCard.tsx.bak — same convention as the earlier
 * cockpit backup, and it stays until asked to delete it.
 *
 * Layout, top to bottom:
 *   row 1   date block (AUG / 29 / FRI) · thumbnail · title · status pill · favourite heart
 *   row 2   tag chips — surface, visibility, "Approval Required"
 *   row 3   four stats — distance, elevation, est. time, difficulty
 *   row 4   footer — date + time, location, participants
 *
 * WHERE THE DATA COMES FROM, and what is deliberately blank:
 *
 *   real, server        name, status, visibility, startsAt, location, activityType, level,
 *                       organizerGroup (the last four are on the summary — see EventSummary's
 *                       doc comment for why they used to be missing)
 *   real, this device   distance / elevation / cover image, from store/eventExtrasStore.ts,
 *                       which only exists on the device that created the ride. Server values
 *                       win where both exist; nothing is invented when neither does.
 *   client-only         the favourite heart (lib/local-db.ts's toggleFavorite — no server
 *                       column for it)
 *   NOT AVAILABLE       est. time, participants "n / capacity", and "Approval Required" on a
 *                       list card. The list endpoint returns no duration, no participant count,
 *                       no capacity and no requiresApproval, and there is no way to derive any
 *                       of them from what it does return. They render as "soon" rather than
 *                       being computed, guessed, or silently dropped — see NOT_YET below.
 */

import { CalendarDays, Heart, MapPin, Mountain, Ruler, Timer, UsersRound } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { EventSummary } from "../lib/local-db";
import { wazeUrl } from "../lib/nav-links";
import { LEVELS, levelHeadingFor, levelLabelFor } from "../lib/rider-level";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL } from "../lib/surface-types";
import { formatLocalTime } from "../lib/time";
import { useEventsStore } from "../store/eventsStore";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import styles from "./EventCard.module.css";
import {
  eventCoverBackground,
  FIGMA_TAG_LABEL,
  figmaStatus,
  recordOpenedEvent,
} from "./event-visuals";
import { useOwnerCover } from "./useOwnerCover";

/**
 * The placeholder for a stat the API genuinely cannot answer yet. One shared constant so every
 * such cell reads the same, and so a grep for it lists exactly what is still owed — rather than
 * each gap being papered over differently (or, worse, filled with a plausible-looking number).
 */
const NOT_YET = "soon";

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayTimeFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function dateParts(iso: string | null): { month: string; day: string; weekday: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    month: monthFormat.format(date).toUpperCase(),
    day: String(date.getDate()),
    weekday: weekdayFormat.format(date).toUpperCase(),
  };
}

export function EventCard({
  event,
  isNew,
  justOpened,
}: {
  event: EventSummary;
  isNew?: boolean;
  justOpened?: boolean;
}) {
  const status = figmaStatus(event.status);
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const extras = getEventExtras(extrasByEvent, event.id);

  // Written through eventsStore.toggleFavoriteRide, which updates BOTH IndexedDB and the
  // in-memory My Rides list — so the See-All view's favourites-only filter agrees with the
  // heart immediately. The local mirror exists for the Find Rides list, whose events are not
  // in myRides and so would otherwise not repaint until the next load.
  const toggleFavoriteRide = useEventsStore((s) => s.toggleFavoriteRide);
  const [favorite, setFavorite] = useState(event.favorite === true);

  // Server first, this device's copy second. No third fallback: a ride whose organizer never
  // set a difficulty shows no difficulty scale at all, because an empty scale reads as "easiest".
  const level = event.level ?? extras.level ?? null;
  const levelIndex = level ? LEVELS.findIndex((l) => l.value === level) : -1;
  const activityType = event.activityType ?? extras.activityType ?? null;
  const TypeIcon = activityType ? SURFACE_TYPE_ICON[activityType] : null;

  const distanceKm = extras.distanceKm ?? event.distanceKm ?? null;
  const climbM = extras.climbM ?? event.climbM ?? null;

  const when = dateParts(event.startsAt);
  // The organizer's own cover when they have one, else this event's local cover, else the
  // built-in scene — one chain, in lib/user-identity.ts. See useOwnerCover.
  const ownerCover = useOwnerCover(event.ownerId, event.ownerCover);
  const coverBackground = eventCoverBackground(event.id, extras.coverImageDataUrl, ownerCover);

  function handleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFavorite((previous) => !previous);
    void toggleFavoriteRide(event.id);
  }

  function handleNavigate(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const href = wazeUrl(event.location, null);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <Link
      to={`/events/${event.id}`}
      className={styles.card}
      data-new={isNew || justOpened || undefined}
      onClick={() => recordOpenedEvent(event.id)}
    >
      <div className={styles.head}>
        {/* The date block. Rendered only for a ride that actually has a start date — an
            empty slot is better than a placeholder date nobody set. */}
        {when ? (
          <div className={styles.dateBlock}>
            <span className={styles.dateMonth}>{when.month}</span>
            <span className={styles.dateDay}>{when.day}</span>
            <span className={styles.dateWeekday}>{when.weekday}</span>
          </div>
        ) : (
          <div className={styles.dateBlock} data-empty="true">
            <span className={styles.dateMonth}>—</span>
          </div>
        )}

        {/* Cover art: the organizer's uploaded image when this device has one, otherwise one of
            the ten built-in abstract scenes, picked deterministically from the event id (see
            event-visuals.ts's generatedCoverUrl). */}
        <div className={styles.thumb} style={{ background: coverBackground }} />

        <div className={styles.headMain}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{event.name}</span>
            <span className={styles.tag} data-status={status}>
              {status === "live" && <span className={styles.liveDot} aria-hidden="true" />}
              {FIGMA_TAG_LABEL[status]}
            </span>
            <button
              type="button"
              className={styles.heartBtn}
              data-on={favorite}
              onClick={handleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
            >
              <Heart
                width={18}
                height={18}
                aria-hidden="true"
                fill={favorite ? "currentColor" : "none"}
              />
            </button>
          </div>

          <div className={styles.chipRow}>
            {activityType && TypeIcon && (
              <span className={styles.chip} data-kind="surface" data-surface={activityType}>
                <TypeIcon width={12} height={12} aria-hidden="true" />
                {SURFACE_TYPE_LABEL[activityType]}
              </span>
            )}
            <span className={styles.chip} data-kind={event.visibility}>
              {event.visibility === "private" ? "Private" : "Public"}
            </span>
            {/* "Approval Required" belongs here in the design, but requiresApproval is only on
                the DETAIL response — the list endpoint does not send it, so a card cannot know.
                Left out entirely rather than defaulted: rendering "Approval Required" (or its
                absence) from a guess would be a claim about how to join this ride. */}
          </div>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <Ruler className={styles.statIcon} aria-hidden="true" />
          <span className={styles.statValue}>{distanceKm != null ? `${distanceKm} km` : "—"}</span>
          <span className={styles.statLabel}>Distance</span>
        </div>
        <div className={styles.stat}>
          <Mountain className={styles.statIcon} aria-hidden="true" />
          <span className={styles.statValue}>{climbM != null ? `${climbM} m` : "—"}</span>
          <span className={styles.statLabel}>Elevation</span>
        </div>
        {/* Est. time: no duration field exists anywhere — not on the event, not on the route.
            Deriving one from distance would need an assumed speed, which is exactly the kind of
            invented number this app does not ship. */}
        <div className={styles.stat} data-pending="true">
          <Timer className={styles.statIcon} aria-hidden="true" />
          <span className={styles.statValue}>{NOT_YET}</span>
          <span className={styles.statLabel}>Est. Time</span>
        </div>
        <div className={styles.stat}>
          {level ? (
            <>
              <span className={styles.levelBars} aria-hidden="true">
                {LEVELS.map((l, i) => (
                  <span
                    key={l.value}
                    className={styles.levelBar}
                    data-level={l.value}
                    data-filled={i <= levelIndex}
                    style={{ height: `${5 + i * 3}px` }}
                  />
                ))}
              </span>
              <span className={styles.statValue}>{levelLabelFor(level, activityType)}</span>
              <span className={styles.statLabel}>{levelHeadingFor(activityType)}</span>
            </>
          ) : (
            <>
              <span className={styles.statValue}>—</span>
              <span className={styles.statLabel}>{levelHeadingFor(activityType)}</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        {event.startsAt && (
          <span className={styles.footerItem}>
            <CalendarDays className={styles.footerIcon} aria-hidden="true" />
            {dayTimeFormat.format(new Date(event.startsAt))}, {formatLocalTime(event.startsAt)}
          </span>
        )}
        {event.location && (
          <button
            type="button"
            className={styles.footerLink}
            onClick={handleNavigate}
            aria-label={`Navigate to ${event.location}`}
            title="Open in Waze"
          >
            <MapPin className={styles.footerIcon} aria-hidden="true" />
            {event.location}
          </button>
        )}
        {/* Participants "n / capacity": the list endpoint returns neither a count nor a
            capacity, and there is no capacity column server-side at all. One count would cost a
            participants call per card. */}
        <span className={styles.footerItem} data-pending="true">
          <UsersRound className={styles.footerIcon} aria-hidden="true" />
          {NOT_YET}
        </span>
      </div>
    </Link>
  );
}
