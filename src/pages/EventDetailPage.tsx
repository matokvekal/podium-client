/**
 * Event detail
 *
 * Route:    /events/:eventId
 * Loads:    GET /events/:eventId — respects the event's visibility settings. The route map
 *           comes from the real GET /events/:eventId/route (via store/resultsStore.ts) and
 *           the rider list from the real GET /events/:eventId/participants — no mock data.
 * Actions:  owner: edit details, move through the status workflow, cancel
 * State:    the loaded event, an inline edit form toggle
 * Calls:    GET /events/:eventId, PATCH /events/:eventId, PATCH /events/:eventId/status,
 *           DELETE /events/:eventId (soft delete — sets status to cancelled)
 *
 * The rider list is name-sorted only — no sort/category picker, no per-rider time/place/DNF
 * status, no split times. This app is rides-only for
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
  CalendarDays,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  Ruler,
  Settings,
  Share2,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { eventCoverBackground, FIGMA_TAG_LABEL, figmaStatus } from "../app/event-visuals";
import { LiveTracking } from "../app/LiveTracking";

import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";

import { type EventStatus, type EventSummary, getCachedEvent } from "../lib/local-db";
import { googleMapsUrl, wazeUrl } from "../lib/nav-links";
import { LEVEL_LABEL, LEVELS } from "../lib/rider-level";
import { SURFACE_TYPE_ICON } from "../lib/surface-types";
import { formatLocalDateTime } from "../lib/time";
import { type DayForecast, getForecastForDate } from "../lib/weather";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import { useEventsStore } from "../store/eventsStore";
import { useInvitedEventsStore } from "../store/invitedEventsStore";
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
  registrationStatus: "registered" | "waiting_approval" | "approved" | "rejected";
  attendanceStatus: "unknown" | "present" | "dns" | "started";
}

/** GET /events/:eventId/participants row — just enough to render the real start list below
 * (name/bib) and compute the real rider count + pending-approval badge. */
interface RealParticipant {
  id: number;
  name: string | null;
  avatarUrl: string | null;
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
  ownerName: string | null;
  ownerAvatarUrl: string | null;
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

function mergeParticipantStatus(previous: EventDetail | null, incoming: EventDetail): EventDetail {
  const prev = previous?.myParticipant;
  const next = incoming.myParticipant;

  // Approval is monotonic in this UI flow: there is no "unapprove back to pending" action.
  // If a stale poll response arrives right after an approved read, keep approved to avoid
  // a visible green->pending bounce for the same participant row.
  if (
    prev &&
    next &&
    prev.id === next.id &&
    prev.registrationStatus === "approved" &&
    next.registrationStatus === "waiting_approval"
  ) {
    return {
      ...incoming,
      myParticipant: {
        ...next,
        registrationStatus: "approved",
      },
    };
  }

  return incoming;
}

/** Mirrors the server's transition graph (event.service.ts): published (and any older event
 * still sitting in registration_open/ready) can go straight to live — those two are optional
 * waypoints, not required steps before Go Live.
 *
 * `draft` is deliberately absent, and there is no Publish action anywhere in this app. Create
 * is a single step: POST /events returns an event already published, so draft is not a state
 * this client produces, transitions out of, or compensates for. Asked for directly ("why i
 * need button PUBLISH At all?"). An event that somehow arrives here as a draft therefore shows
 * no start action — that is a server-side inconsistency to report, and quietly patching it
 * from the client would only hide it. */
const NEXT_STATUS: Partial<Record<EventStatus, { status: EventStatus; label: string }>> = {
  published: { status: "live", label: "Start — go live" },
  registration_open: { status: "live", label: "Start — go live" },
  ready: { status: "live", label: "Start — go live" },
  live: { status: "finished", label: "Finish" },
};

const CANCELLABLE: EventStatus[] = ["draft", "published", "registration_open", "ready", "live"];

// The cache only ever holds the summary shape (whatever a list screen last saw) — the
// fields a list never has (description, requiresBib, finishedAt, isOwner) get an honest
// "unknown yet" default until the real fetch resolves and replaces this.
// The real fetch is what normally decides isOwner; while it's still in flight, fall back to
// the same profile.id === ownerId check EventTile.tsx already uses on the tile itself, so a
// cached "my ride" doesn't look read-only for the instant before the real fetch resolves.
function detailFromCachedSummary(summary: EventSummary, viewerId: number | null): EventDetail {
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
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null;
  const { profile } = useAuth();
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which consequential action (go live / finish / leave) is awaiting an in-place confirm tap —
  // replaces the window.confirm() popups asked to be swapped for real UI ("not just simple
  // alert"). null means the normal action button(s) show; otherwise the owner-actions row (or,
  // for "leave", the rider's own sticky bottom bar) swaps to a small message + Cancel/Confirm
  // pair for that one action.
  const [confirming, setConfirming] = useState<"live" | "finish" | "leave" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [approvalFxPhase, setApprovalFxPhase] = useState<"idle" | "arming" | "celebrate">("idle");
  const [approvalFxProgress, setApprovalFxProgress] = useState(0);
  const previousRegistrationStatusRef = useRef<string | null>(null);

  const results = useResultsStore((state) => state.results);
  const resultsLoading = useResultsStore((state) => state.loading);
  const resultsError = useResultsStore((state) => state.error);
  const loadResults = useResultsStore((state) => state.loadResults);

  const [forecast, setForecast] = useState<DayForecast | null>(null);

  // The route's own start point stands in for "where this event is" — Location is free text,
  // never geocoded (see lib/weather.ts's doc comment). Silently shows nothing outside
  // Open-Meteo's ~16-day range or if the request fails; never a fabricated forecast.
  useEffect(() => {
    const start = results?.route?.points[0];
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
  // without permission just gets a 403, handled by an honest "unavailable" placeholder below).
  //
  // This used to show a full mock rider list (results.riders, from lib/mock-results.ts,
  // unconditional on every event) and a fake seedParticipantCount number in the stats row —
  // "i create ride, i didnt add riders but how i do see riders, its bug," flagged as the most
  // important one, direct. That mock is gone (BUGS.md "Remove fake/mock riders"): `realRoster`
  // is `null` until this resolves (or forever, if this viewer truly can't see it — an honest
  // placeholder shows then) and a real (possibly empty) array the instant it does; the render
  // below only ever shows realRoster, including an honest "no riders yet" for an empty one,
  // rather than ever faking names for people who never joined.
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
        const list = await apiRequest<RealParticipant[]>(`/events/${eventId}/participants`);
        if (cancelled) return;
        setRealRiderCount(list.length);
        setRealRoster(list);
        setPendingCount(list.filter((p) => p.registrationStatus === "waiting_approval").length);
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

  // Real start list, name-sorted — see the fetch effect's doc comment above for why this is
  // the only rider list this page ever renders.
  const visibleRealRoster = useMemo(() => {
    if (!realRoster) return null;
    return [...realRoster].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [realRoster]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    const cached = await getCachedEvent(eventId);
    if (cached) {
      const asDetail = detailFromCachedSummary(cached, profile?.id ?? null);
      // The cache paint exists to fill an EMPTY screen while the real fetch is in flight — it
      // is never an update. Writing it unconditionally is what let a stale summary walk a
      // started ride backwards: refreshing (or landing back here from the live screen) could
      // repaint "published" over a live event and put START back on screen for a ride already
      // under way. Anything already in state came from the server or from a transition this
      // page just performed, so it outranks the cache by definition — keep it.
      setEvent((previous) => (previous && previous.id === asDetail.id ? previous : asDetail));
      setLoading(false);
    }

    try {
      const found = await apiRequest<EventDetail>(`/events/${eventId}`);
      setEvent((previous) => mergeParticipantStatus(previous, found));
      // Keep Zustand and the cache in step with the server response, not just this component
      // — the same single write path every status transition uses.
      useEventsStore.getState().upsertRide(found);
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

  // Approval has no push channel yet. While this rider is waiting_approval, re-pull this
  // event detail in the background so the CTA/status flips to approved without a manual reload.
  useEffect(() => {
    if (!eventId) return;
    if (event?.myParticipant?.registrationStatus !== "waiting_approval") return;

    let cancelled = false;
    async function pollPendingApproval() {
      try {
        const found = await apiRequest<EventDetail>(`/events/${eventId}`);
        if (cancelled) return;
        setEvent((previous) => mergeParticipantStatus(previous, found));
        useEventsStore.getState().upsertRide(found);
      } catch {
        // Keep current UI state; a later poll will retry.
      }
    }

    void pollPendingApproval();
    const id = window.setInterval(pollPendingApproval, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventId, event?.myParticipant?.registrationStatus]);

  // Approval dopamine: if this rider's approval lands and they haven't seen it yet on this
  // device, show a short 2s arming bar and then a subtle celebration chip.
  useEffect(() => {
    const eventKey = event?.id ?? null;
    const current = event?.myParticipant?.registrationStatus ?? null;
    const previous = previousRegistrationStatusRef.current;
    previousRegistrationStatusRef.current = current;

    if (!eventKey || current !== "approved") return;
    if (approvalFxPhase !== "idle") return;

    const seenKey = `elnino.approval-seen.${eventKey}`;
    const alreadySeen = window.sessionStorage.getItem(seenKey) === "1";
    // Show this when approval is newly observed from a pending state, or first seen while
    // approved and not yet acknowledged in this browser session.
    if (alreadySeen || (previous !== "waiting_approval" && previous !== null)) return;

    let alive = true;
    setApprovalFxPhase("arming");
    setApprovalFxProgress(0);

    const t1 = window.setTimeout(() => {
      if (!alive) return;
      setApprovalFxProgress(100);
    }, 40);

    const t2 = window.setTimeout(() => {
      if (!alive) return;
      setApprovalFxPhase("celebrate");
      window.sessionStorage.setItem(seenKey, "1");
    }, 2000);

    const t3 = window.setTimeout(() => {
      if (!alive) return;
      setApprovalFxPhase("idle");
      setApprovalFxProgress(0);
    }, 6000);

    return () => {
      alive = false;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [approvalFxPhase, event?.id, event?.myParticipant?.registrationStatus]);

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
  // earlier low-stakes steps (Open registration, Mark ready) stay one-tap.
  async function changeStatus(nextStatus: EventStatus) {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<EventDetail>(`/events/${eventId}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      setEvent((previous) => mergeParticipantStatus(previous, updated));
      // The server's updated event is the authoritative state — push it into Zustand and the
      // IndexedDB cache together, not just this component. Without that, the transition lived
      // only in local state: navigating to the live page and coming back to the ride info
      // re-painted from the stale cached summary, which still said "published" — so the
      // organizer was shown "Start — go live" for a ride that had already started ("he not
      // need start since the ride already start", asked for directly). The real fetch would
      // eventually correct it, but that is a flash of the wrong button at best, and mid-ride
      // on a phone with no signal it never corrects at all.
      useEventsStore.getState().upsertRide(updated);
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
      setError(err instanceof ApiError ? err.message : "Could not change the event status.");
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
      setRegisterError(err instanceof ApiError ? err.message : "Could not register. Try again.");
    } finally {
      setRegisterBusy(false);
    }
  }

  // Self-leave for a rider who already joined (not the organizer — that's cancelEvent below).
  // Reuses the frozen POST /events/:eventId/leave endpoint; on success just re-fetches the
  // event the same way handleRegister's join does, rather than hand-patching myParticipant, so
  // this stays in sync with whatever else a fresh load would also pick up (e.g. rider count).
  //
  // On a genuinely successful leave (not on cancel/error) this event should also move off the
  // home screen's My Rides list and back onto the Invited banner, so the rider can still find
  // it and rejoin later — asked for directly. My Rides is refetched for real (the server drops
  // this event from filter=joined once left_at is set) rather than hand-filtered locally, and
  // the event is re-added to invitedEventsStore using the code/name/type already loaded here.
  async function leaveEvent() {
    if (!eventId || !event) return;
    setRegisterBusy(true);
    setRegisterError(null);
    try {
      await apiRequest(`/events/${eventId}/leave`, { method: "POST" });
      useInvitedEventsStore.getState().addInvite({
        eventId: event.id,
        code: event.code,
        name: event.name,
        type: event.type,
        invitedAt: Date.now(),
      });
      await Promise.all([load(), useEventsStore.getState().loadMyRides(true)]);
    } catch (err) {
      setRegisterError(err instanceof ApiError ? err.message : "Could not leave. Try again.");
    } finally {
      setRegisterBusy(false);
      setConfirming(null);
    }
  }

  async function cancelEvent() {
    if (!eventId) return;
    if (!window.confirm("Cancel this event? Riders will no longer be able to join.")) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<EventDetail>(`/events/${eventId}`, {
        method: "DELETE",
      });
      setEvent((previous) => mergeParticipantStatus(previous, updated));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this event.");
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

  const routePoint = results?.route?.points[0] ?? null;
  // "not all events have team so each event can be ready if have name date /place" — asked
  // for directly, and this is where that lands: a published event offers Start outright, with
  // no extra readiness gate on top of it. No team requirement, no minimum rider count, no
  // registration window, no separate "Mark ready" step. Those three facts are collected on
  // the create form, so every event that exists already has them.
  const next = NEXT_STATUS[displayStatus];
  const wazeHref = wazeUrl(event.location, routePoint);
  const googleMapsHref = googleMapsUrl(event.location, routePoint);
  const extras = getEventExtras(extrasByEvent, event.id);
  const ActivityIcon = SURFACE_TYPE_ICON[extras.activityType ?? "road"];
  // Same fallback chain EventCard.tsx/EventTile.tsx use on the list cards — a team or manual
  // club name the organizer explicitly picked on EventCreatePage.tsx (extras.organizerGroup)
  // wins; failing that, the real signed-in owner's name (event.ownerName — nickname, else
  // first+last, resolved server-side). An event with neither now shows NO organizer line at
  // all. There used to be a third fallback that invented a club name from the event id; that
  // is gone, because a made-up organization on a real ride is indistinguishable from the
  // truth to the rider reading it.
  // Only the "real owner" branch has a photo to show — a club/team name is not an account,
  // so there is no server avatar for it.
  const level = extras.level ?? null;
  const levelIndex = level ? LEVELS.findIndex((l) => l.value === level) : -1;
  const organizerIsRealOwner = !extras.organizerGroup && !!event.ownerName;
  const organizer = extras.organizerGroup ?? event.ownerName ?? null;
  const organizerAvatarUrl = organizerIsRealOwner ? event.ownerAvatarUrl : null;
  const coverBackground = eventCoverBackground(event.id, extras.coverImageDataUrl);
  const riderCount = realRiderCount;
  const bucket = figmaStatus(displayStatus);
  const canEditNow = event.isOwner && displayStatus !== "live" && displayStatus !== "finished";
  // Who gets into the live page. The old gate here was `event.showLiveLocations` alone, which
  // hid the live map from the ride's own registered riders: show_live_locations defaults to
  // FALSE (plan/02-database-schema.md:195), so on a typical event nobody but the organizer
  // ever saw a way in. The server's actual rule is narrower than that flag suggests — per
  // 07-api-contract.md:372, GET /events/:eventId/live only 403s when the flag is off *and the
  // caller is not a member*. So a rider who joined this ride always belongs on that page, and
  // the flag only decides whether a passing non-member viewer does too.
  const canSeeLive = event.myParticipant != null || event.showLiveLocations;

  // Owner never registers for their own ride; a rider who already finished/cancelled events
  // can't join either — same guard the old bottom card and sign-in link used.
  const showRiderCta =
    !event.isOwner && displayStatus !== "finished" && displayStatus !== "cancelled";

  return (
    <section className={styles.page}>
      {/* --- hero: colored placeholder (no real cover-image field yet, same honest-fallback
          rule as EventCard/EventTile) with the date/status pinned to its corners and the
          name/organizer overlaid at the bottom. ------------------------------------------ */}
      <div className={styles.hero} style={{ background: coverBackground }}>
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
              {displayStatus === "cancelled" ? "Cancelled" : FIGMA_TAG_LABEL[bucket]}
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
          {organizer && (
            <div className={styles.organizerRow}>
              <Avatar
                className={styles.avatar}
                name={organizer}
                avatarUrl={organizerAvatarUrl}
                seed={organizer}
              />
              Organized by {organizer}
            </div>
          )}
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
          {riderCount != null && (
            <span className={styles.statItem}>
              <Users width={15} height={15} aria-hidden="true" />
              {riderCount} Riders
            </span>
          )}
          {/* Organizer's own distance/climb (typed or auto-filled from a picked route on
              EventCreatePage.tsx) wins over the saved route's numbers — that's the real value
              for this event once it's set. */}
          {(extras.distanceKm ?? results?.route?.distanceKm) != null && (
            <span className={styles.statItem}>
              <Ruler width={15} height={15} aria-hidden="true" />
              {extras.distanceKm ?? results?.route?.distanceKm} km
            </span>
          )}
          {(extras.climbM ?? results?.route?.elevationM) != null && (
            <span className={styles.statItem}>
              <Mountain width={15} height={15} aria-hidden="true" />
              {extras.climbM ?? results?.route?.elevationM} m
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
            title={isPastDue ? "Automatically marked finished — the date has passed" : undefined}
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
              picker — read-only here, just the current level lit. Hidden when the organizer
              set no difficulty, rather than showing an unlit scale that reads as "easiest". */}
          {level && (
            <span
              className={`${styles.levelBars} ${styles.tagsRowSpacer}`}
              title={LEVEL_LABEL[level]}
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
          )}
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
                    onClick={() => changeStatus(confirming === "live" ? "live" : "finished")}
                  >
                    {busy ? "…" : confirming === "live" ? "Go live" : "Stop event"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {canEditNow && (
                  <Link className={styles.editBtn} to={`/events/${event.id}/edit`}>
                    <Pencil width={16} height={16} aria-hidden="true" />
                    Edit
                  </Link>
                )}
                {displayStatus === "live" ? (
                  <>
                    <Link className={styles.startBtn} to={`/events/live/${event.id}`}>
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
                        next.status === "live" ? setConfirming("live") : changeStatus(next.status)
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

        {/* Riders get the same LIVE button in the same slot as the organizer — asked for
            directly ("if ride start the riders/client also have to see LIVE button and see
            similar page live as we see for the creator"). It goes to the very same
            /events/live/:eventId page the owner's button does (LiveEventPage.tsx already
            serves both, with the owner-only extras kept inside it), so there is no separate
            second-class rider view to keep in sync. The full live map is never embedded here
            for anyone. */}
        {displayStatus === "live" && !event.isOwner && canSeeLive && (
          <div className={styles.ownerActions}>
            <Link className={styles.startBtn} to={`/events/live/${event.id}`}>
              LIVE
            </Link>
          </div>
        )}

        {/* Only kept for the paused case now, where it explains why the markers on that map
            are standing still. The "live now" version of this card was redundant next to the
            button above. */}
        {displayStatus === "live" && !event.isOwner && canSeeLive && event.isPaused && (
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
              <Avatar
                className={styles.avatar}
                name={organizer}
                avatarUrl={organizerAvatarUrl}
                seed={organizer}
              />
              Organized by {organizer}
            </p>
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
            {/* --- conditions -------------------------------------------------------------
                Real weather only (lib/weather.ts, Open-Meteo). Two badges used to sit beside
                it — "Air: Good" and "Roads clear" — both invented from a hash of the event id
                because no provider exists for either. A fabricated air-quality or traffic
                reading on a real ride is a safety claim this app cannot back up, and a rider
                cannot tell it apart from a measurement. Removed rather than replaced with a
                placeholder; when a real provider is wired up, add them back reading it.
                The card only appears when there is something real to show. */}
            {forecast && (
              <div className="card stack">
                <p className={styles.infoLabel}>Conditions</p>
                <p
                  className="muted row"
                  style={{ margin: 0, gap: "6px", flexWrap: "wrap" }}
                  title={forecast.label}
                >
                  <span aria-hidden="true" style={{ fontSize: "1.1em" }}>
                    {forecast.emoji}
                  </span>
                  {forecast.source === "historical" ? "Recorded" : "Forecast"}: {forecast.label} ·{" "}
                  {forecast.tempMinC}°–{forecast.tempMaxC}°C
                  {forecast.cloudCoverPct != null && ` · ${forecast.cloudCoverPct}% cloud`}
                  {forecast.windSpeedKmh != null && ` · ${forecast.windSpeedKmh} km/h wind`}
                  {forecast.precipitationChancePct != null &&
                    ` · ${forecast.precipitationChancePct}% rain`}
                  {!!forecast.precipitationMm && ` (${forecast.precipitationMm} mm)`}
                  {!!forecast.snowfallCm && ` · ${forecast.snowfallCm} cm snow`}
                </p>
              </div>
            )}

            {/* --- route preview ------------------------------------------------------------ */}
            <div className="card stack">
              <p className={styles.infoLabel}>Route preview</p>
              {results.route ? (
                <>
                  <Suspense fallback={<div className="row muted">Loading the map…</div>}>
                    <RouteMap points={results.route.points} />
                  </Suspense>
                  <div className={styles.statsRow} style={{ marginTop: "var(--space-2)" }}>
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
                </>
              ) : (
                // Neither the organizer's saved route (server, or this device's own local
                // cache) exists yet — an honest empty state, never a fabricated route
                // standing in as if it were real (see resultsStore.ts's doc comment).
                <p className="muted">No route added yet.</p>
              )}
            </div>

            {/* "if riders are published we will see them" — the organizer's own "Riders list
                open to view" switch (EventCreatePage.tsx) gates this for everyone else; the
                organizer still sees their own start list regardless, same as every other
                owner-only visibility rule on this page. */}
            {(event.isOwner || event.showParticipants) && (
              <div className="card stack">
                <p className={styles.infoLabel}>
                  Riders ({visibleRealRoster ? visibleRealRoster.length : "…"})
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
                      [...visibleRealRoster]
                        .sort((a, b) => {
                          const meId = event.myParticipant?.id ?? null;
                          if (meId === null) return 0;
                          if (a.id === meId) return -1;
                          if (b.id === meId) return 1;
                          return 0;
                        })
                        .map((rider) => {
                          const isMe = event.myParticipant?.id === rider.id;
                          return (
                            <div key={rider.id} className={styles.realRiderRow}>
                              <Avatar
                                className={styles.realRiderAvatar}
                                name={rider.name}
                                avatarUrl={rider.avatarUrl}
                                seed={String(rider.id)}
                              />
                              <span className={styles.realRiderName}>
                                {rider.name?.trim() || "Unnamed rider"}
                                {isMe && <span className="muted"> (ME)</span>}
                                {rider.bib && <span className="muted"> #{rider.bib}</span>}
                              </span>
                            </div>
                          );
                        })
                    )
                  ) : (
                    // Real list not visible/available to this viewer yet (still loading, or a
                    // permission this viewer doesn't have) — an honest placeholder, never a
                    // fabricated rider list (BUGS.md "Remove fake/mock riders").
                    <p className="muted">Rider list unavailable.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Bottom-bar CTA takes over the rider join flow below — this reserves its height so
            the last card never sits underneath the fixed bar. */}
        {showRiderCta && <div className={styles.bottomBarSpacer} aria-hidden="true" />}
      </div>

      {/* --- sticky bottom CTA — "I'M IN", asked for directly ---------------------------- */}
      {showRiderCta && (
        <div className={styles.bottomBar}>
          {approvalFxPhase !== "idle" && (
            <div className={styles.approvalFx} data-phase={approvalFxPhase} role="status">
              {approvalFxPhase === "arming" ? (
                <>
                  <span className={styles.approvalFxTitle}>Approval update incoming…</span>
                  <div className={styles.approvalFxTrack} aria-hidden="true">
                    <div
                      className={styles.approvalFxFill}
                      style={{ width: `${approvalFxProgress}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className={styles.approvalFxTitle}>Approved. See you at the ride.</span>
              )}
            </div>
          )}
          {confirming === "leave" ? (
            <div className={styles.confirmBar}>
              <span className={styles.confirmMessage}>
                Leave this event? You can join again later if it still has room.
              </span>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.confirmCancelBtn}
                  disabled={registerBusy}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.confirmOkBtn}
                  data-tone="danger"
                  disabled={registerBusy}
                  onClick={leaveEvent}
                >
                  {registerBusy ? "…" : "Leave event"}
                </button>
              </div>
            </div>
          ) : !profile ? (
            <Link className={styles.ctaBtn} to="/login" state={{ from: `/events/${event.id}` }}>
              Sign in to join
            </Link>
          ) : event.myParticipant ? (
            <>
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
              {event.myParticipant.registrationStatus !== "approved" && (
                <button
                  type="button"
                  className={styles.leaveBtn}
                  onClick={() => setConfirming("leave")}
                >
                  Leave
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={styles.ctaBtn}
              disabled={registerBusy}
              onClick={handleRegister}
            >
              {registerBusy ? "Joining…" : event.requiresApproval ? "Request to join" : "I'M IN"}
            </button>
          )}
          {registerError && (
            <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
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
