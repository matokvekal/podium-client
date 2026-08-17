/**
 * A single row in the "Other Rides" list, and in "My Rides"'s See-All full list. Ported
 * directly from Figma (Tomer-Design / new-commissaire, "All Races" > Card/N), not from the
 * old race-pwa code — see EventCard.module.css for the full note.
 *
 * No favourite affordance in this design (unlike the previous pass) — the toolbar's
 * favourites-only filter in EventsListPage.tsx currently has no way to set one back on,
 * pending a spec for that.
 *
 * The status tag gets a blinking dot when live, so a live ride reads as urgent ("live ride
 * ... has to be at top in some blinking so i can get in fast" — same request EventTile's live
 * bar answers for the home row). An Organizing/Joined tag lived here too, briefly — pulled
 * after a look at real data: this rider's own events all say "Organizing," so with nothing to
 * contrast against it just read as noise. See EventTile.tsx's doc comment for the same call.
 *
 * Three rows of "should I join this" data, asked for directly ("i need extra data at card ...
 * number of riders register the dificalty and the orgenizer/club/team"): date + how many
 * riders are on the start list (Users, count via lib/mock-participants.ts's
 * seedParticipantCount — no real registration-count endpoint exists yet, so this mirrors
 * whatever EventParticipantsPage would seed for the same id); time + location; level + who's
 * organizing. Level and organizer are real data when this rider (or their device) set them via
 * EventCreatePage — otherwise event-visuals.ts's mockLevel/mockOrganizerName fill in something
 * deterministic rather than leaving a blank, since neither has a server column yet to sync a
 * real value from someone else's device.
 */

import {
  CalendarDays,
  Clock3,
  MapPin,
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
import { wazeUrl } from "../lib/nav-links";
import { LEVEL_LABEL, LEVELS } from "../lib/rider-level";
import { formatLocalTime } from "../lib/time";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import styles from "./EventCard.module.css";
import {
  FIGMA_TAG_LABEL,
  figmaStatus,
  initialOf,
  mockLevel,
  mockOrganizerName,
  placeholderColorVar,
  recordOpenedEvent,
} from "./event-visuals";

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
});

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : shortDateFormat.format(date);
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
  const level = extras.level ?? mockLevel(event.id);
  const levelIndex = LEVELS.findIndex((l) => l.value === level);
  const organizer = extras.organizerGroup ?? mockOrganizerName(event.id);
  const riderCount = seedParticipantCount(event.id);
  // Same fallback EventDetailPage.tsx uses when this device never set one (no server column
  // yet — see EventCreatePage.tsx's doc comment on Activity type).
  const activityType = extras.activityType ?? "road";
  const TypeIcon = SURFACE_TYPE_ICON[activityType];
  const { profile } = useAuth();
  const navigate = useNavigate();
  // Edit shortcut right on the card — asked for directly, and only while there's still time
  // to change anything: once a ride goes live/finishes, EventDetailPage's own edit action is
  // gone too, so this mirrors that same "upcoming only" rule rather than inventing a new one.
  const canEdit =
    status === "upcoming" && profile != null && profile.id === event.ownerId;

  function handleEdit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/events/${event.id}/edit`);
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
      <div
        className={styles.image}
        style={{ background: placeholderColorVar(event.id) }}
      >
        {initialOf(event.name)}
      </div>

      <div className={styles.text}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{event.name}</span>
          {canEdit && (
            <button
              type="button"
              className={styles.editBtn}
              onClick={handleEdit}
              aria-label="Edit ride"
              title="Edit ride"
            >
              <Pencil aria-hidden="true" />
            </button>
          )}
          <span className={styles.tag} data-status={status}>
            {status === "live" && (
              <span className={styles.liveDot} aria-hidden="true" />
            )}
            {FIGMA_TAG_LABEL[status]}
          </span>
        </div>

        {/* Location sits next to the date now, not off in its own row — asked for directly
            ("at the card the location will be near the date"). Its icon opens Waze, since the
            row is inside the card's own Link — a nested <a> would be invalid HTML, so this is
            a button that stops the click from also opening the ride. */}
        <div className={styles.metaRow}>
          {event.startsAt && (
            <span className={styles.metaItem}>
              <CalendarDays className={styles.metaIcon} aria-hidden="true" />
              {shortDate(event.startsAt)}
            </span>
          )}
          {event.location && (
            <button
              type="button"
              className={styles.metaLinkItem}
              onClick={handleNavigate}
              aria-label={`Navigate to ${event.location}`}
              title="Open in Waze"
            >
              <MapPin className={styles.metaIcon} aria-hidden="true" />
              {event.location}
            </button>
          )}
        </div>

        <div className={styles.metaRow}>
          {event.startsAt && (
            <span className={styles.metaItem}>
              <Clock3 className={styles.metaIcon} aria-hidden="true" />
              {formatLocalTime(event.startsAt)}
            </span>
          )}
          <span className={styles.metaItem}>
            <Users className={styles.metaIcon} aria-hidden="true" />
            {riderCount} riders
          </span>
          {/* Same read-only "stairs" as EventDetailPage.tsx's difficulty display — asked for
              directly ("dificalty icons stairs it important"). */}
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
          <span className={styles.metaItem}>{organizer}</span>
        </div>
      </div>
    </Link>
  );
}
