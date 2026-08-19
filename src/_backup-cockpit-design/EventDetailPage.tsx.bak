/**
 * Event detail
 *
 * Route:    /events/:eventId
 * Loads:    GET /events/:eventId — respects the event's visibility settings. The route map
 *           and rider results shown directly on this page come from lib/mock-results.ts
 *           until the server actually has GET /events/:eventId/results — see
 *           plan/server-tasks.md.
 * Actions:  owner: edit details, move through the status workflow, cancel
 * State:    the loaded event, an inline edit form toggle
 * Calls:    GET /events/:eventId, PATCH /events/:eventId, PATCH /events/:eventId/status,
 *           DELETE /events/:eventId (soft delete — sets status to cancelled)
 *
 * The rider list is name-sorted only — no sort/category picker, no per-rider time/place/DNF
 * status, no split times. See RiderResultRow.tsx's doc comment: this app is rides-only for
 * now, not a timed competition.
 *
 * `displayStatus` (computed below, after the null-guard) shows an event as "finished" once its
 * end time has passed, even if the real server status hasn't caught up — asked for directly
 * ("after date passed ... it can be changed"). Purely a display computation, recomputed fresh
 * every load; there's no server cron to actually flip the stored status, and this never writes
 * anything back. Manually clicking "Finish" (via `changeStatus`) still does a real PATCH.
 *
 * This is the hub: everything about one event is reachable from here, including its route
 * and results directly inline — no separate "view results" page/click-through. It also
 * applies the event's display_mode to the whole document while it is open, so opening a race
 * switches the interface to competition styling and leaving it switches back.
 *
 * Reachable without signing in — GET /events/:eventId takes an optional viewer now, so a
 * public event opens for a guest the same as its card does on the home screen. A cached
 * summary (from lib/local-db.ts, written whenever this event appeared in a list) paints
 * instantly while the real fetch is still in flight, and stays on screen if that fetch
 * fails — "isOwner" is simply false for anyone who isn't signed in as the owner, which
 * already hides every management action below without any extra auth check here.
 */

import {
  AlertTriangle,
  CalendarDays,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  Phone,
  Ruler,
  Settings,
  Share2,
  Users,
  UsersRound,
  Wind,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { mockLevel, mockOrganizerName } from "../app/event-visuals";
import { LiveTracking } from "../app/LiveTracking";
import { RiderResultRow } from "../app/RiderResultRow";
import { useAuth } from "../auth/AuthContext";
import { getEventAirQuality } from "../lib/air-quality";
import { ApiError, apiRequest } from "../lib/api-client";
import { countryFlagEmoji } from "../lib/country-flag";
import {
  type EventStatus,
  type EventSummary,
  getCachedEvent,
  putCachedEvent,
} from "../lib/local-db";
import { seedParticipantCount } from "../lib/mock-participants";
import { SURFACE_TYPE_ICON } from "../lib/mock-tracks";
import { googleMapsUrl, wazeUrl } from "../lib/nav-links";
import { LEVEL_LABEL, LEVELS } from "../lib/rider-level";
import { formatLocalDateTime } from "../lib/time";
import { getEventTraffic } from "../lib/traffic";
import { type DayForecast, getForecastForDate } from "../lib/weather";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import { useResultsStore } from "../store/resultsStore";
import styles from "./EventDetailPage.module.css";

const RouteMap = lazy(() => import("../app/RouteMap"));
// The qrcode package is real weight for a sheet most sessions never open — lazy, same as
// RouteMap above.
const ShareEventSheet = lazy(() =>
  import("../app/ShareEventSheet").then((m) => ({
    default: m.ShareEventSheet,
  })),
);

interface MyParticipant {
  id: number;
  registrationStatus:
    "registered" | "waiting_approval" | "approved" | "rejected";
  attendanceStatus: "unknown" | "present" | "dns" | "started";
}

interface EventDetail {
  id: string;
  code: string;
  name: string;
  type: "RIDE" | "RACE";
  status: EventStatus;
  visibility: "public" | "private";
  displayMode: "standard" | "competition";
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  ownerId: number | null;
  requiresBib: boolean;
  description: string | null;
  finishedAt: string | null;
  isOwner: boolean;
  requiresApproval: boolean;
  isPaused: boolean;
  effectiveStatus: EventStatus;
  showParticipants: boolean;
  showLiveLocations: boolean;
  myParticipant: MyParticipant | null;
}

/** Mirrors the server's transition graph (event.service.ts) with a button label per step. */
const NEXT_STATUS: Partial<
  Record<EventStatus, { status: EventStatus; label: string }>
> = {
  draft: { status: "published", label: "Publish" },
  published: { status: "registration_open", label: "Open registration" },
  registration_open: { status: "ready", label: "Mark ready" },
  ready: { status: "live", label: "Start — go live" },
  live: { status: "finished", label: "Finish" },
};

const CANCELLABLE: EventStatus[] = [
  "draft",
  "published",
  "registration_open",
  "ready",
  "live",
];

// The cache only ever holds the summary shape (whatever a list screen last saw) — the
// fields a list never has (description, requiresBib, finishedAt, isOwner) get an honest
// "unknown yet" default until the real fetch resolves and replaces this.
// The real fetch is what normally decides isOwner; while it's still in flight (or for the
// client-only local dev sign-in, which has no server behind it at all — see
// AuthContext.signInAsLocalDevUser / lib/mock-my-rides.ts's ownerId: -1 sentinel — where it
// never resolves), fall back to the same profile.id === ownerId check EventTile.tsx already
// uses on the tile itself. Without this, every mock "my ride" looked read-only forever: no
// Manage/Participants/Share/Start-Finish, nothing to preview any event status in.
function detailFromCachedSummary(
  summary: EventSummary,
  viewerId: number | null,
): EventDetail {
  return {
    ...summary,
    requiresBib: false,
    description: null,
    finishedAt: null,
    isOwner: viewerId != null && viewerId === summary.ownerId,
    requiresApproval: false,
    isPaused: false,
    effectiveStatus: summary.status,
    showParticipants: true,
    showLiveLocations: true,
    myParticipant: null,
  };
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const location = useLocation();
  const redirectMessage =
    (location.state as { message?: string } | null)?.message ?? null;
  const { profile } = useAuth();
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const results = useResultsStore((state) => state.results);
  const resultsLoading = useResultsStore((state) => state.loading);
  const resultsError = useResultsStore((state) => state.error);
  const loadResults = useResultsStore((state) => state.loadResults);

  const [forecast, setForecast] = useState<DayForecast | null>(null);

  // The route's own start point stands in for "where this event is" — Location is free text,
  // never geocoded (see lib/weather.ts's doc comment). Silently shows nothing outside
  // Open-Meteo's ~16-day range or if the request fails; never a fabricated forecast.
  useEffect(() => {
    const start = results?.route.points[0];
    if (!start || !event?.startsAt) {
      setForecast(null);
      return;
    }
    let cancelled = false;
    getForecastForDate(start[0], start[1], event.startsAt).then((found) => {
      if (!cancelled) setForecast(found);
    });
    return () => {
      cancelled = true;
    };
  }, [results, event?.startsAt]);

  useEffect(() => {
    if (eventId) loadResults(eventId);
  }, [eventId, loadResults]);

  // Just riders on a ride, name-sorted — no bib/category sort options and no category filter;
  // both are race-result concepts, hidden per the same decision as EventCreatePage.tsx.
  const visibleRiders = useMemo(() => {
    if (!results) return [];
    return [...results.riders].sort((a, b) => a.name.localeCompare(b.name));
  }, [results]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    const cached = await getCachedEvent(eventId);
    if (cached) {
      const asDetail = detailFromCachedSummary(cached, profile?.id ?? null);
      setEvent(asDetail);
      // Paint the cached summary now; the real fetch below still runs and replaces it.
      setLoading(false);
    }

    try {
      const found = await apiRequest<EventDetail>(`/events/${eventId}`);
      setEvent(found);
      putCachedEvent(found);
    } catch (err) {
      // A cached summary is still on screen — a failed refresh shouldn't blank it out.
      if (cached) return;
      setError(
        err instanceof ApiError && err.status === 403
          ? "This event is private."
          : err instanceof ApiError && err.status === 404
            ? "Event not found."
            : "Could not load this event.",
      );
    } finally {
      setLoading(false);
    }
  }, [eventId, profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Applies the event's display mode to the whole document while this page is open, and
  // restores whatever was there before on the way out — display mode is presentation only,
  // never data or permissions (see app/display-mode.ts).
  useEffect(() => {
    if (!event) return;
    const html = document.documentElement;
    const previous = html.getAttribute("data-display-mode");
    html.setAttribute("data-display-mode", event.displayMode);
    return () => {
      if (previous) html.setAttribute("data-display-mode", previous);
      else html.removeAttribute("data-display-mode");
    };
  }, [event]);

  // confirmMessage is only passed for the two consequential transitions (going live, and
  // finishing/stopping) — asked for directly ("it ask are you sure also for start"). The
  // earlier low-stakes steps (Publish, Open registration, Mark ready) stay one-tap, same as
  // Cancel's own window.confirm above.
  async function changeStatus(
    nextStatus: EventStatus,
    confirmMessage?: string,
  ) {
    if (!eventId) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<EventDetail>(
        `/events/${eventId}/status`,
        {
          method: "PATCH",
          body: { status: nextStatus },
        },
      );
      setEvent(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not change the event status.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Reuses the frozen POST /events/join (keyed by the event's own code) rather than a new
  // endpoint — the same call JoinPage.tsx makes for a code/QR join, just triggered from here.
  async function handleRegister() {
    if (!event) return;
    setRegisterBusy(true);
    setRegisterError(null);
    try {
      await apiRequest(`/events/join`, {
        method: "POST",
        body: { eventCode: event.code },
      });
      await load();
    } catch (err) {
      setRegisterError(
        err instanceof ApiError
          ? err.message
          : "Could not register. Try again.",
      );
    } finally {
      setRegisterBusy(false);
    }
  }

  async function cancelEvent() {
    if (!eventId) return;
    if (
      !window.confirm(
        "Cancel this event? Riders will no longer be able to join.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<EventDetail>(`/events/${eventId}`, {
        method: "DELETE",
      });
      setEvent(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not cancel this event.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading…</span>
      </div>
    );
  }

  if (error && !event) {
    return (
      <p className="banner banner--error" role="alert">
        {error}
      </p>
    );
  }

  if (!event) return null;

  // The server now computes the same "past-due counts as finished" rule (event.effectiveStatus,
  // see event.service.ts's computeEffectiveStatus) so every client agrees without a cron job
  // ever writing the real status back. Fall back to the same calc locally only for the instant
  // the cached summary is painted, before the real fetch (which always includes
  // effectiveStatus) resolves.
  const scheduledEnd = event.endsAt ?? event.startsAt;
  const isPastDue =
    scheduledEnd != null &&
    new Date(scheduledEnd) < new Date() &&
    event.status !== "finished" &&
    event.status !== "cancelled" &&
    event.status !== "live";
  const displayStatus: EventStatus =
    event.effectiveStatus ?? (isPastDue ? "finished" : event.status);

  const next = NEXT_STATUS[displayStatus];
  const routePoint = results?.route.points[0] ?? null;
  const wazeHref = wazeUrl(event.location, routePoint);
  const googleMapsHref = googleMapsUrl(event.location, routePoint);
  const airQuality = getEventAirQuality(event.id, event.startsAt);
  const traffic = getEventTraffic(event.id, event.startsAt);
  const extras = getEventExtras(extrasByEvent, event.id);
  const ActivityIcon = SURFACE_TYPE_ICON[extras.activityType ?? "road"];
  // Same fallbacks EventCard.tsx uses on the list card — level/organizer aren't real data
  // yet (no server column), so a deterministic mock fills in rather than showing blank; the
  // point is that whatever the card promised before the click is what's still here after it.
  const level = extras.level ?? mockLevel(event.id);
  const levelIndex = LEVELS.findIndex((l) => l.value === level);
  const organizer = extras.organizerGroup ?? mockOrganizerName(event.id);
  const riderCount = seedParticipantCount(event.id);

  return (
    <section className={styles.page}>
      <div className={styles.deck}>
        <span
          className={`${styles.corner} ${styles.cornerTl}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerTr}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerBl}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerBr}`}
          aria-hidden="true"
        />

        <div className={styles.header}>
          {/* Row 1: icon beside the name — "up the event name and at side the activity
              icon", asked for directly. */}
          <div className={styles.headerTop}>
            <div className={styles.headerIcon}>
              <ActivityIcon aria-hidden="true" />
            </div>
            <div className={styles.headerText}>
              <h1 className={styles.title}>{event.name}</h1>
              <span className={styles.codeTag}>{event.code}</span>
            </div>
          </div>
          {/* Row 2: the action buttons, all together — "second row all butons like start
              edit share", asked for directly. Wraps if it doesn't fit one line. */}
          <div className={styles.headerActions}>
            {/* Edit was previously reachable only through the Command menu further down the
                page — asked for directly to put it right in the header instead, next to Share.
                Same guard as that menu item: gone once live/finished, since the server blocks
                general-detail edits past that point anyway (EventCreatePage.tsx's edit-mode
                guard). Links to the same EventCreatePage component Create uses, in edit mode. */}
            {event.isOwner &&
              displayStatus !== "live" &&
              displayStatus !== "finished" && (
                <Link
                  className={styles.editBtn}
                  to={`/events/${event.id}/edit`}
                  aria-label="Edit this event"
                  title="Edit event"
                >
                  <Pencil aria-hidden="true" />
                </Link>
              )}
            {/* Was buried in a "Command" card at the bottom of the page — asked for directly
                ("the orgenize action is at end and that not good must be up"), moved into the
                header next to Edit/Share. Same slot, two lives: while live this is the "LIVE"
                link straight to the dedicated live page (asked for: "if it allredy started
                then the caption change to LIVE ... that bring us to new page"), plus a
                separate Stop button next to it ("i need some stop event that make it past");
                otherwise it fires the next status transition (Publish/Open registration/etc.),
                with a confirm prompt on the two consequential ones (going live, finishing). */}
            {event.isOwner &&
              (displayStatus === "live" ? (
                <>
                  <Link
                    className={styles.startBtn}
                    to={`/events/${event.id}/live`}
                  >
                    LIVE
                  </Link>
                  <button
                    type="button"
                    className={styles.stopBtn}
                    disabled={busy}
                    onClick={() =>
                      changeStatus(
                        "finished",
                        "Stop this event and mark it finished? This can't be undone.",
                      )
                    }
                  >
                    Stop
                  </button>
                </>
              ) : (
                next && (
                  <button
                    type="button"
                    className={styles.startBtn}
                    disabled={busy}
                    onClick={() =>
                      changeStatus(
                        next.status,
                        next.status === "live"
                          ? "Go live now? Riders will see the ride as started."
                          : undefined,
                      )
                    }
                  >
                    {next.label}
                  </button>
                )
              ))}
            <button
              type="button"
              className={styles.shareBtn}
              onClick={() => setShareOpen(true)}
              aria-label="Share this event"
              title="Share — code, QR, link"
            >
              <Share2 aria-hidden="true" />
            </button>
            {event.isOwner && (
              <button
                type="button"
                className={styles.menuTriggerIcon}
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                aria-label="More organizer actions"
                title="More organizer actions"
              >
                <Settings aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="banner banner--error" role="alert">
            {error}
          </p>
        )}
        {redirectMessage && <p className="banner">{redirectMessage}</p>}

        {/* --- quick facts: the status strip every viewer scans first ------------------- */}
        <div className="card stack">
          <div className="row">
            <span
              className={
                displayStatus === "live"
                  ? "badge badge--live"
                  : displayStatus === "finished"
                    ? "badge badge--finished"
                    : displayStatus === "cancelled"
                      ? "badge badge--danger"
                      : "badge badge--pending"
              }
              title={
                isPastDue
                  ? "Automatically marked finished — the date has passed"
                  : undefined
              }
            >
              {displayStatus.replace("_", " ")}
            </span>
            <span className="badge">{event.visibility}</span>
            {/* Same steps visual (and color-per-level scheme) as the create page's difficulty
                picker, asked for directly ("insted of intemidiate show the level step as the
                create"). Read-only here — just the current level lit. */}
            <span
              className={styles.levelBars}
              title={LEVEL_LABEL[level]}
              aria-label={`Difficulty: ${LEVEL_LABEL[level]}`}
            >
              {LEVELS.map((l, i) => (
                <span
                  key={l.value}
                  className={styles.levelBar}
                  data-level={l.value}
                  data-filled={i === levelIndex}
                  style={{ height: `${6 + i * 4}px` }}
                />
              ))}
            </span>
            <span className="badge">
              <Users width={12} height={12} aria-hidden="true" />
              {riderCount} riders
            </span>
            {results?.route.distanceKm != null && (
              <span className="badge">
                <Ruler width={12} height={12} aria-hidden="true" />
                {results.route.distanceKm} km
              </span>
            )}
            {results?.route.elevationM != null && (
              <span className="badge">
                <Mountain width={12} height={12} aria-hidden="true" />
                {results.route.elevationM} m
              </span>
            )}
            {event.requiresApproval && event.isOwner && (
              <span
                className="badge"
                title="Riders who join must be approved before they're in"
              >
                Approval required
              </span>
            )}
            {event.isPaused && (
              <span
                className="badge badge--pending"
                title="The organizer has paused live tracking"
              >
                Paused
              </span>
            )}
          </div>
        </div>

        {/* Owner gets the LIVE entry point in the header's Start/LIVE button — this compact
            summary is only for a non-owner viewer, who has no such control. The full live map
            itself is never embedded here; it's the fully separate /events/:eventId/live page. */}
        {displayStatus === "live" &&
          !event.isOwner &&
          event.showLiveLocations && (
            <LiveTracking eventId={event.id} isPaused={event.isPaused} />
          )}

        {/* --- primary CTA: right under the status strip, not buried under everything else
            ("pro ux" reorg) — a browsing rider's next step should be the second thing on the
            page, not the fifth. --------------------------------------------------------- */}
        {!event.isOwner &&
          profile &&
          displayStatus !== "finished" &&
          displayStatus !== "cancelled" && (
            <div className="card stack">
              {event.myParticipant ? (
                <span
                  className="badge"
                  data-status={event.myParticipant.registrationStatus}
                >
                  {event.myParticipant.registrationStatus === "waiting_approval"
                    ? "Pending approval"
                    : event.myParticipant.registrationStatus === "rejected"
                      ? "Registration rejected"
                      : event.myParticipant.registrationStatus === "approved"
                        ? "Approved"
                        : "Registered"}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={registerBusy}
                    onClick={handleRegister}
                  >
                    {event.requiresApproval
                      ? "Request to Register"
                      : "Register"}
                  </button>
                  {registerError && (
                    <p className="banner banner--error" role="alert">
                      {registerError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

        {!event.isOwner &&
          !profile &&
          displayStatus !== "finished" &&
          displayStatus !== "cancelled" && (
            <Link
              className={`button ${styles.primaryAction}`}
              to="/login"
              state={{ from: `/events/${event.id}` }}
            >
              Sign in to register
            </Link>
          )}

        {/* --- at a glance: where/when/who, one card, one source of truth per field (was
            split across two cards before — start time and organizer each shown twice) ----- */}
        <div className="card stack">
          {/* Date and location share one row — "near dat add the location field", asked for
              directly (was two separate lines before). */}
          {(event.startsAt || event.location) && (
            <p
              className={`${styles.highlightRow} row`}
              style={{ margin: 0, gap: "14px", flexWrap: "wrap" }}
            >
              {event.startsAt && (
                <span className="row" style={{ gap: "6px" }}>
                  <CalendarDays width={16} height={16} aria-hidden="true" />
                  {formatLocalDateTime(event.startsAt)}
                </span>
              )}
              {event.location && (
                <span className="row" style={{ gap: "6px" }}>
                  <MapPin width={16} height={16} aria-hidden="true" />
                  {event.location}
                  {wazeHref && (
                    <a
                      href={wazeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.navLink}
                      aria-label="Navigate with Waze"
                      title="Navigate with Waze"
                    >
                      <Navigation width={14} height={14} aria-hidden="true" />
                      Waze
                    </a>
                  )}
                  {googleMapsHref && (
                    <a
                      href={googleMapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.navLink}
                      aria-label="Navigate with Google Maps"
                      title="Navigate with Google Maps"
                    >
                      <MapPin width={14} height={14} aria-hidden="true" />
                      Maps
                    </a>
                  )}
                </span>
              )}
            </p>
          )}
          <div className="row" style={{ gap: "6px" }}>
            <p className="muted row" style={{ margin: 0, gap: "6px" }}>
              <Users width={14} height={14} aria-hidden="true" />
              Organized by {organizer}
            </p>
            {/* Flag/phone come from the (async, mock-until-server) results endpoint, so they
                fade in once that resolves rather than blocking this always-available line. */}
            {results && countryFlagEmoji(results.organizer.countryCode) && (
              <span aria-hidden="true" style={{ fontSize: "1.1em" }}>
                {countryFlagEmoji(results.organizer.countryCode)}
              </span>
            )}
            {results?.organizer.phone && (
              <span className="muted row" style={{ margin: 0, gap: "4px" }}>
                <Phone width={14} height={14} aria-hidden="true" />
                {results.organizer.phone}
              </span>
            )}
          </div>
          {event.description && (
            <div className={styles.infoBlock}>
              <p className={styles.infoLabel}>{"// MISSION BRIEF"}</p>
              <p style={{ margin: 0 }}>{event.description}</p>
            </div>
          )}
        </div>

        {resultsLoading && !results && (
          <div className="row">
            <span className="spinner" aria-hidden="true" />
            <span className="muted">Loading route & results…</span>
          </div>
        )}

        {resultsError && !results && (
          <p className="banner banner--error" role="alert">
            {resultsError}
          </p>
        )}

        {results && (
          <div className="stack">
            {/* Organizer contact and start time now live once, in the "at a glance" card
                above (they were duplicated here before — same two facts, two different
                cards). This card is conditions only now. */}
            <div className="card stack">
              <p className={styles.infoLabel}>{"// CONDITIONS"}</p>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span
                  className={`${styles.conditionBadge} ${
                    airQuality.label === "Good"
                      ? styles.conditionGood
                      : airQuality.label === "Moderate"
                        ? styles.conditionModerate
                        : styles.conditionBad
                  }`}
                  title={`Air quality index ${airQuality.aqi} — illustrative, no live provider yet`}
                >
                  <Wind width={12} height={12} aria-hidden="true" />
                  Air: {airQuality.label}
                </span>
                <span
                  className={`${styles.conditionBadge} ${
                    traffic.level === "ok"
                      ? styles.conditionGood
                      : styles.conditionBad
                  }`}
                  title="Illustrative — no live traffic provider yet"
                >
                  <AlertTriangle width={12} height={12} aria-hidden="true" />
                  {traffic.label}
                </span>
              </div>
              {forecast && (
                <p
                  className="muted row"
                  style={{ margin: 0, gap: "6px", flexWrap: "wrap" }}
                  title={forecast.label}
                >
                  <span aria-hidden="true" style={{ fontSize: "1.1em" }}>
                    {forecast.emoji}
                  </span>
                  {forecast.source === "historical" ? "Recorded" : "Forecast"}:{" "}
                  {forecast.label} · {forecast.tempMinC}°–{forecast.tempMaxC}°C
                  {forecast.cloudCoverPct != null &&
                    ` · ${forecast.cloudCoverPct}% cloud`}
                  {forecast.windSpeedKmh != null &&
                    ` · ${forecast.windSpeedKmh} km/h wind`}
                  {forecast.precipitationChancePct != null &&
                    ` · ${forecast.precipitationChancePct}% rain`}
                  {!!forecast.precipitationMm &&
                    ` (${forecast.precipitationMm} mm)`}
                  {!!forecast.snowfallCm && ` · ${forecast.snowfallCm} cm snow`}
                </p>
              )}
            </div>

            <Suspense
              fallback={<div className="row muted">Loading the map…</div>}
            >
              <RouteMap points={results.route.points} />
            </Suspense>

            {/* "if riders are published we will see them" — the organizer's own "Riders list
                open to view" switch (EventCreatePage.tsx) gates this for everyone else; the
                organizer still sees their own start list regardless, same as every other
                owner-only visibility rule on this page. */}
            {(event.isOwner || event.showParticipants) && (
              <>
                <h2 style={{ margin: 0 }}>Riders ({visibleRiders.length})</h2>
                <div
                  className="stack"
                  style={{
                    maxHeight: "60vh",
                    overflowY: "auto",
                    paddingRight: "2px",
                  }}
                >
                  {visibleRiders.map((rider) => (
                    <RiderResultRow key={rider.id} rider={rider} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {shareOpen && (
          <Suspense fallback={null}>
            <ShareEventSheet
              eventName={event.name}
              eventCode={event.code}
              onClose={() => setShareOpen(false)}
            />
          </Suspense>
        )}

        {/* Bottom sheet, not a popover — "the organizer action not seen" (a small dropdown was
          getting clipped/missed); a full-width sheet sliding up ~1/3 of the screen is both
          more visible and consistent with every other action sheet in this app
          (CopyTrackSheet, ParticipantFormSheet, TracksPage's filter sheet). */}
        {menuOpen && (
          <>
            <div
              className={styles.menuOverlay}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className={styles.menu} role="menu">
              <div className={styles.menuHeader}>
                <span>Organizer actions</span>
                <button
                  type="button"
                  className={styles.menuClose}
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close"
                >
                  <X width={18} height={18} aria-hidden="true" />
                </button>
              </div>
              {/* Edit and Share both moved to standalone header buttons next to this menu
                  trigger — this sheet is just what's left over: Participants/Groups/Cancel.
                  While live, "Participants" is relabeled "Manage": it's the same restricted
                  page (add/remove/check-in riders, pause/stop), not a separate screen. */}
              <Link
                className={styles.menuItem}
                to={`/events/${event.id}/participants`}
                onClick={() => setMenuOpen(false)}
              >
                <Users width={16} height={16} aria-hidden="true" />
                {displayStatus === "live" ? "Manage" : "Participants"}
              </Link>
              <Link
                className={styles.menuItem}
                to={`/events/${event.id}/groups`}
                onClick={() => setMenuOpen(false)}
              >
                <UsersRound width={16} height={16} aria-hidden="true" />
                Groups
              </Link>
              {CANCELLABLE.includes(displayStatus) && (
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    cancelEvent();
                  }}
                >
                  <X width={16} height={16} aria-hidden="true" />
                  Cancel event
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
