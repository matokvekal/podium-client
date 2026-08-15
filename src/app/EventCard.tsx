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

import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { EventSummary } from "../lib/local-db";
import { seedParticipantCount } from "../lib/mock-participants";
import { LEVEL_ICON, LEVEL_LABEL } from "../lib/rider-level";
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
} from "./event-visuals";

const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" });

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : shortDateFormat.format(date);
}

export function EventCard({ event }: { event: EventSummary }) {
  const status = figmaStatus(event.status);
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const extras = getEventExtras(extrasByEvent, event.id);
  const level = extras.level ?? mockLevel(event.id);
  const organizer = extras.organizerGroup ?? mockOrganizerName(event.id);
  const riderCount = seedParticipantCount(event.id);
  const LevelIcon = LEVEL_ICON[level];

  return (
    <Link to={`/events/${event.id}`} className={styles.card}>
      <div className={styles.image} style={{ background: placeholderColorVar(event.id) }}>
        {initialOf(event.name)}
      </div>

      <div className={styles.text}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{event.name}</span>
          <span className={styles.tag} data-status={status}>
            {status === "live" && <span className={styles.liveDot} aria-hidden="true" />}
            {FIGMA_TAG_LABEL[status]}
          </span>
        </div>

        <div className={styles.metaRow}>
          {event.startsAt && (
            <span className={styles.metaItem}>
              <CalendarDays className={styles.metaIcon} aria-hidden="true" />
              {shortDate(event.startsAt)}
            </span>
          )}
          <span className={styles.metaItem}>
            <Users className={styles.metaIcon} aria-hidden="true" />
            {riderCount} riders
          </span>
        </div>

        <div className={styles.metaRow}>
          {event.startsAt && (
            <span className={styles.metaItem}>
              <Clock3 className={styles.metaIcon} aria-hidden="true" />
              {formatLocalTime(event.startsAt)}
            </span>
          )}
          {event.location && (
            <span className={styles.metaItem}>
              <MapPin className={styles.metaIcon} aria-hidden="true" />
              {event.location}
            </span>
          )}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <LevelIcon className={styles.metaIcon} aria-hidden="true" />
            {LEVEL_LABEL[level]}
          </span>
          <span className={styles.metaItem}>{organizer}</span>
        </div>
      </div>
    </Link>
  );
}
