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
 *
 * Visuals: redesigned from a neon "cockpit" skin to a clean hero-photo-style layout, matching
 * a reference screenshot supplied directly — full-bleed colored hero (no real cover-image
 * field exists yet, see event-visuals.ts's placeholderColorVar) with the date/status pinned to
 * its corners and the name/organizer overlaid at the bottom, then a stats row, a tags row
 * (status/visibility/difficulty), owner actions, an at-a-glance card, conditions, route
 * preview, riders, and a sticky bottom CTA for a browsing rider. The previous cockpit-styled
 * version is kept at src/_backup-cockpit-design/EventDetailPage.tsx.bak, asked for directly.
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
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FIGMA_TAG_LABEL,
  figmaStatus,
  initialOf,
  mockLevel,
  mockOrganizerName,
  placeholderColorVar,
} from "../app/event-visuals";
import { LiveTracking } from "../app/LiveTracking";
import { RiderResultRow } from "../app/RiderResultRow";
import { useAuth } from "../auth/AuthContext";
import { getEventAirQuality } from "../lib/air-quality";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";
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

// For the hero date badge (month/day shown as two separate stacked lines, not one combined
// string) — kept as two formatters, not one, so there's no risk of the field-order bug
// formatLocalDateTime hit (lib/time.ts's own doc comment).
const heroMonthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });
const heroDayFormat = new Intl.DateTimeFormat(undefined, { day: "2-digit" });

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

/** GET /events/:eventId/participants row — just enough to render the real start list below
 * (name/bib) and compute the real rider count + pending-approval badge. */
interface RealParticipant {
  id: number;
  name: string | null;
  bib: string | null;
  registrationStatus: string;
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

/** Mirrors the server's transition graph (event.service.ts): published (and any older event
 * still sitting in registration_open/ready) can go straight to live — those two are optional
 * waypoints, not required steps before Go Live. */
const NEXT_STATUS: Partial<
  Record<EventStatus, { status: EventStatus; label: string }>
> = {
  draft: { status: "published", label: "Publish" },
  published: { status: "live", label: "Start — go live" },
  registration_open: { status: "live", label: "Start — go live" },
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
  const navigate = useNavigate();
  const location = useLocation();
  const redirectMessage =
    (location.state as { message?: string } | null)?.message ?? null;
  const { profile } = useAuth();
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which consequential action (go live / finish) is awaiting an in-place confirm tap —
  // replaces the two window.confirm() popups asked to be swapped for real UI ("not just
  // simple alert"). null means the normal action button(s) show; otherwise the owner-actions
  // row swaps to a small message + Cancel/Confirm pair for that one action.
  const [confirming, setConfirming] = useState<"live" | "finish" | null>(null);
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

  // Real rider list/count — same best-effort GET /events/:eventId/participants call
  // LiveEventPage.tsx's roster already makes (gated server-side by show_participants; a viewer
  // without permission just gets a 403, handled by falling back to the mock riders below).
  //
  // Was showing a full mock rider list (results.riders, from lib/mock-results.ts, unconditional
  // on every event) below and a fake seedParticipantCount number in the stats row — "i create
  // ride, i didnt add riders but how i do see riders, its bug," flagged as the most important
  // one, direct. `realRoster` is `null` until this resolves (or forever, if this viewer truly
  // can't see it — mock stands in only then) and a real (possibly empty) array the instant it
  // does; the render below shows realRoster whenever it's non-null, including an honest "no
  // riders yet" for an empty one, rather than ever faking names for people who never joined.
  const [realRiderCount, setRealRiderCount] = useState<number | null>(null);
  const [realRoster, setRealRoster] = useState<RealParticipant[] | null>(null);
  // Pending-approval count, same fetch — surfaced as a badge below so the organizer notices a
  // join request without having to remember to check the Participants page. "Approve/reject"
  // itself already existed there (EventParticipantsPage.tsx); this just makes it visible from
  // the hub too — "if i request to join the creator need to see me request," asked for
  // directly.
  const [pendingCount, setPendingCount] = useState(0);
  // Polled, not one-shot — "we will not use soket so puling can be every 2-3 minutes," asked
  // for directly: there's no push channel for "a rider just requested to join," so this page
  // re-pulls on config.backgroundPollIntervalMs while it's open rather than only checking once
  // on load. Same setInterval/cleanup shape as LiveEventPage.tsx's position poll, just a much
  // longer interval since this isn't time-critical the way live tracking is.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setRealRiderCount(null);
    setRealRoster(null);
    setPendingCount(0);

    async function poll() {
      if (!eventId) return;
      try {
        const list = await apiRequest<RealParticipant[]>(
          `/events/${eventId}/participants`,
        );
        if (cancelled) return;
        setRealRiderCount(list.length);
        setRealRoster(list);
        setPendingCount(
          list.filter((p) => p.registrationStatus === "waiting_approval")
            .length,
        );
      } catch {
        // Not visible to this viewer, or not built for this event — mock stands in.
      }
    }

    void poll();
    const id = window.setInterval(poll, config.backgroundPollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventId]);

  // Just riders on a ride, name-sorted — no bib/category sort options and no category filter;
  // both are race-result concepts, hidden per the same decision as EventCreatePage.tsx.
  const visibleRiders = useMemo(() => {
    if (!results) return [];
    return [...results.riders].sort((a, b) => a.name.localeCompare(b.name));
  }, [results]);

  // Real start list, name-sorted same as visibleRiders above — see the fetch effect's doc
  // comment for why this wins over visibleRiders whenever it's available.
  const visibleRealRoster = useMemo(() => {
    if (!realRoster) return null;
    return [...realRoster].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? ""),
    );
  }, [realRoster]);

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

  // The two consequential transitions (going live, and finishing/stopping) are confirmed via
  // the inline confirm bar below (see `confirming` state) rather than a window.confirm() popup
  // — asked for directly ("good ui ux like small button... not just simple alert"). The
  // earlier low-stakes steps (Publish, Open registration, Mark ready) stay one-tap.
  async function changeStatus(nextStatus: EventStatus) {
    if (!eventId) return;
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
      // Clicking "Start — go live" only re-labeled the header button to "LIVE" before,
      // requiring a second tap to actually get there — asked for directly ("i click at go
      // live but got stary at same page... muve me to live scen"). Jump straight to the live
      // page the instant the transition succeeds.
      if (nextStatus === "live") {
        navigate(`/events/live/${eventId}`);
      }
    } catch (err) {
      // Going live is time-sensitive ("i'm about to ride") — a network hiccup shouldn't be
      // able to strand the organizer on this page staring at a "you appear to be offline"
      // banner, asked for directly ("so what? just move me if it started"). The live page's
      // own polling will just show nothing new until connectivity returns, which is a much
      // smaller problem than being stuck. Only applies to that one specific failure mode
      // (ApiError.isOffline, api-client.ts) — a real server error (403/500/etc.) still shows.
      if (nextStatus === "live" && err instanceof ApiError && err.isOffline) {
        navigate(`/events/live/${eventId}`);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not change the event status.",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
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
  const riderCount = realRiderCount ?? seedParticipantCount(event.id);
  const bucket = figmaStatus(displayStatus);
  const canEditNow =
    event.isOwner && displayStatus !== "live" && displayStatus !== "finished";
  // Owner never registers for their own ride; a rider who already finished/cancelled events
  // can't join either — same guard the old bottom card and sign-in link used.
  const showRiderCta =
    !event.isOwner &&
    displayStatus !== "finished" &&
    displayStatus !== "cancelled";

  return (
    <section className={styles.page}>
      {/* --- hero: colored placeholder (no real cover-image field yet, same honest-fallback
          rule as EventCard/EventTile) with the date/status pinned to its corners and the
          name/organizer overlaid at the bottom. ------------------------------------------ */}
      <div
        className={styles.hero}
        style={{ background: placeholderColorVar(event.id) }}
      >
        <ActivityIcon className={styles.heroWatermark} aria-hidden="true" />
        <div className={styles.heroScrim} />

        <div className={styles.heroTop}>
          {event.startsAt ? (
            <span className={styles.dateBadge}>
              <span className={styles.dateBadgeMonth}>
                {heroMonthFormat.format(new Date(event.startsAt))}
              </span>
              <span className={styles.dateBadgeDay}>
                {heroDayFormat.format(new Date(event.startsAt))}
              </span>
            </span>
          ) : (
            <span />
          )}
          <div className={styles.heroTopRight}>
            <span className={styles.statusPill} data-bucket={bucket}>
              {displayStatus === "cancelled"
                ? "Cancelled"
                : FIGMA_TAG_LABEL[bucket]}
            </span>
            <button
              type="button"
              className={styles.heroIconBtn}
              onClick={() => setShareOpen(true)}
              aria-label="Share this event"
              title="Share — code, QR, link"
            >
              <Share2 aria-hidden="true" />
            </button>
            {event.isOwner && (
              <button
                type="button"
                className={styles.heroIconBtn}
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

        <div className={styles.heroBottom}>
          <h1 className={styles.title}>{event.name}</h1>
          <div className={styles.organizerRow}>
            <span
              className={styles.avatar}
              style={{ background: placeholderColorVar(organizer) }}
              aria-hidden="true"
            >
              {initialOf(organizer)}
            </span>
            Organized by {organizer}
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {error && (
          <p className="banner banner--error" role="alert">
            {error}
          </p>
        )}
        {redirectMessage && <p className="banner">{redirectMessage}</p>}

        {/* --- stats row ------------------------------------------------------------------ */}
        <div className={styles.statsRow}>
          <span className={styles.statItem}>
            <Users width={15} height={15} aria-hidden="true" />
            {riderCount} Riders
          </span>
          {/* Organizer's own distance/climb (typed or auto-filled from a picked route on
              EventCreatePage.tsx) wins over the mock route's numbers — that's the real value
              for this event once it's set; the mock route only stands in before that exists. */}
          {(extras.distanceKm ?? results?.route.distanceKm) != null && (
            <span className={styles.statItem}>
              <Ruler width={15} height={15} aria-hidden="true" />
              {extras.distanceKm ?? results?.route.distanceKm} km
            </span>
          )}
          {(extras.climbM ?? results?.route.elevationM) != null && (
            <span className={styles.statItem}>
              <Mountain width={15} height={15} aria-hidden="true" />
              {extras.climbM ?? results?.route.elevationM} m
            </span>
          )}
        </div>

        {/* --- tags row: status / visibility / difficulty stairs --------------------------- */}
        <div className={styles.tagsRow}>
          <span
            className={styles.pill}
            data-tone={
              displayStatus === "cancelled"
                ? "danger"
                : bucket === "live"
                  ? "live"
                  : bucket === "finished"
                    ? "neutral"
                    : "ready"
            }
            title={
              isPastDue
                ? "Automatically marked finished — the date has passed"
                : undefined
            }
          >
            {displayStatus.replace("_", " ")}
          </span>
          <span className={styles.pill} data-tone="neutral">
            {event.visibility}
          </span>
          {event.requiresApproval && event.isOwner && (
            <span
              className={styles.pill}
              data-tone="neutral"
              title="Riders who join must be approved before they're in"
            >
              Approval required
            </span>
          )}
          {event.isPaused && (
            <span
              className={styles.pill}
              data-tone="ready"
              title="The organizer has paused live tracking"
            >
              Paused
            </span>
          )}
          {/* Same steps visual (and color-per-level scheme) as the create page's difficulty
              picker — read-only here, just the current level lit. */}
          <span
            className={`${styles.levelBars} ${styles.tagsRowSpacer}`}
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
        </div>

        {/* --- owner actions: Edit + Start/LIVE/Stop — the rest (Participants/Groups/Cancel)
            live in the "more" sheet opened from the hero's gear icon. ---------------------- */}
        {event.isOwner && (
          <div className={styles.ownerActions}>
            {confirming ? (
              <div className={styles.confirmBar}>
                <span className={styles.confirmMessage}>
                  {confirming === "live"
                    ? "Go live now? Riders will see the ride as started."
                    : "Stop this event and mark it finished? This can't be undone."}
                </span>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmCancelBtn}
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.confirmOkBtn}
                    data-tone={confirming === "finish" ? "danger" : undefined}
                    disabled={busy}
                    onClick={() =>
                      changeStatus(confirming === "live" ? "live" : "finished")
                    }
                  >
                    {busy
                      ? "…"
                      : confirming === "live"
                        ? "Go live"
                        : "Stop event"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {canEditNow && (
                  <Link
                    className={styles.editBtn}
                    to={`/events/${event.id}/edit`}
                  >
                    <Pencil width={16} height={16} aria-hidden="true" />
                    Edit
                  </Link>
                )}
                {displayStatus === "live" ? (
                  <>
                    <Link
                      className={styles.startBtn}
                      to={`/events/live/${event.id}`}
                    >
                      LIVE
                    </Link>
                    <button
                      type="button"
                      className={styles.stopBtn}
                      disabled={busy}
                      onClick={() => setConfirming("finish")}
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
                        next.status === "live"
                          ? setConfirming("live")
                          : changeStatus(next.status)
                      }
                    >
                      {next.label}
                    </button>
                  )
                )}
              </>
            )}
          </div>
        )}

        {/* Owner gets the LIVE entry point above — this compact summary is only for a
            non-owner viewer, who has no such control. The full live map itself is never
            embedded here; it's the fully separate /events/:eventId/live page. */}
        {displayStatus === "live" &&
          !event.isOwner &&
          event.showLiveLocations && (
            <LiveTracking eventId={event.id} isPaused={event.isPaused} />
          )}

        {/* --- at a glance: where/when/who, one card, one source of truth per field --------- */}
        <div className="card stack">
          {event.startsAt && (
            <p
              className={`${styles.highlightRow} row`}
              style={{ margin: 0, gap: "14px", flexWrap: "wrap" }}
            >
              <span className="row" style={{ gap: "6px" }}>
                <CalendarDays width={16} height={16} aria-hidden="true" />
                {formatLocalDateTime(event.startsAt)}
              </span>
            </p>
          )}
          {event.location && (
            <div className={styles.infoBlock}>
              <p className={styles.infoLabel}>Meeting point</p>
              <p className="row" style={{ margin: 0, gap: "6px" }}>
                <MapPin width={16} height={16} aria-hidden="true" />
                {event.location}
              </p>
              {(wazeHref || googleMapsHref) && (
                <div className="row" style={{ gap: "8px", marginTop: 6 }}>
                  {wazeHref && (
                    <a
                      href={wazeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.navLink}
                      aria-label="Navigate with Waze"
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
                    >
                      <MapPin width={14} height={14} aria-hidden="true" />
                      Maps
                    </a>
                  )}
                </div>
              )}
            </div>
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
              <p className={styles.infoLabel}>Mission brief</p>
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
          <>
            {/* --- conditions ------------------------------------------------------------- */}
            <div className="card stack">
              <p className={styles.infoLabel}>Conditions</p>
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
                  Roads: {traffic.label}
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

            {/* --- route preview ------------------------------------------------------------ */}
            <div className="card stack">
              <p className={styles.infoLabel}>Route preview</p>
              <Suspense
                fallback={<div className="row muted">Loading the map…</div>}
              >
                <RouteMap points={results.route.points} />
              </Suspense>
              <div
                className={styles.statsRow}
                style={{ marginTop: "var(--space-2)" }}
              >
                <span className={styles.statItem}>
                  <Ruler width={15} height={15} aria-hidden="true" />
                  {results.route.distanceKm} km
                </span>
                {results.route.elevationM != null && (
                  <span className={styles.statItem}>
                    <Mountain width={15} height={15} aria-hidden="true" />
                    {results.route.elevationM} m
                  </span>
                )}
              </div>
            </div>

            {/* "if riders are published we will see them" — the organizer's own "Riders list
                open to view" switch (EventCreatePage.tsx) gates this for everyone else; the
                organizer still sees their own start list regardless, same as every other
                owner-only visibility rule on this page. */}
            {(event.isOwner || event.showParticipants) && (
              <div className="card stack">
                <p className={styles.infoLabel}>
                  Riders (
                  {visibleRealRoster ? visibleRealRoster.length : visibleRiders.length}
                  )
                </p>
                <div
                  className="stack"
                  style={{
                    maxHeight: "60vh",
                    overflowY: "auto",
                    paddingRight: "2px",
                  }}
                >
                  {visibleRealRoster ? (
                    visibleRealRoster.length === 0 ? (
                      <p className="muted">No riders yet.</p>
                    ) : (
                      visibleRealRoster.map((rider) => (
                        <div key={rider.id} className={styles.realRiderRow}>
                          <span
                            className={styles.realRiderAvatar}
                            style={{
                              background: placeholderColorVar(
                                rider.name ?? String(rider.id),
                              ),
                            }}
                            aria-hidden="true"
                          >
                            {initialOf(rider.name)}
                          </span>
                          <span className={styles.realRiderName}>
                            {rider.name ?? "Unnamed rider"}
                            {rider.bib && (
                              <span className="muted"> #{rider.bib}</span>
                            )}
                          </span>
                        </div>
                      ))
                    )
                  ) : (
                    // Real list not visible/available to this viewer yet (still loading, or a
                    // permission this viewer doesn't have) — mock stands in rather than showing
                    // nothing while it's genuinely just pending.
                    visibleRiders.map((rider) => (
                      <RiderResultRow key={rider.id} rider={rider} />
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Bottom-bar CTA takes over the rider join flow below — this reserves its height so
            the last card never sits underneath the fixed bar. */}
        {showRiderCta && (
          <div className={styles.bottomBarSpacer} aria-hidden="true" />
        )}
      </div>

      {/* --- sticky bottom CTA — "I'M IN", asked for directly ---------------------------- */}
      {showRiderCta && (
        <div className={styles.bottomBar}>
          {!profile ? (
            <Link
              className={styles.ctaBtn}
              to="/login"
              state={{ from: `/events/${event.id}` }}
            >
              Sign in to join
            </Link>
          ) : event.myParticipant ? (
            <span
              className={styles.ctaStatus}
              data-status={event.myParticipant.registrationStatus}
            >
              {event.myParticipant.registrationStatus === "waiting_approval"
                ? "Pending approval"
                : event.myParticipant.registrationStatus === "rejected"
                  ? "Registration rejected"
                  : event.myParticipant.registrationStatus === "approved"
                    ? "Approved — see you there"
                    : "You're in"}
            </span>
          ) : (
            <button
              type="button"
              className={styles.ctaBtn}
              disabled={registerBusy}
              onClick={handleRegister}
            >
              {registerBusy
                ? "Joining…"
                : event.requiresApproval
                  ? "Request to join"
                  : "I'M IN"}
            </button>
          )}
          {registerError && (
            <p
              className="banner banner--error"
              role="alert"
              style={{ margin: 0 }}
            >
              {registerError}
            </p>
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
            {/* Edit and Start/LIVE/Stop both live in the owner action row above this sheet —
                this is just what's left over: Participants/Groups/Cancel. While live,
                "Participants" is relabeled "Manage": it's the same restricted page
                (add/remove/check-in riders, pause/stop), not a separate screen. */}
            <Link
              className={styles.menuItem}
              to={`/events/${event.id}/participants`}
              onClick={() => setMenuOpen(false)}
            >
              <Users width={16} height={16} aria-hidden="true" />
              {displayStatus === "live" ? "Manage" : "Participants"}
              {pendingCount > 0 && (
                <span
                  className="badge badge--live"
                  style={{ marginLeft: "auto" }}
                  title="Riders waiting on your approval"
                >
                  {pendingCount} pending
                </span>
              )}
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
    </section>
  );
}
