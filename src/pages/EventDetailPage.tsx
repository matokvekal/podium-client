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
  CheckCircle2,
  Circle,
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
import { useOwnerAvatar } from "../app/useOwnerAvatar";
import { useOwnerCover } from "../app/useOwnerCover";
import { LiveTracking } from "../app/LiveTracking";

import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";

import { useConnectivityStore } from "../lib/connectivity";
import {
  type CachedParticipant,
  type EventDetail,
  type EventStatus,
  type EventSummary,
  getCachedEvent,
  getCachedEventDetail,
  getCachedParticipants,
  putCachedEventDetail,
  putCachedParticipants,
  viewerKey,
} from "../lib/local-db";
import { googleMapsUrl, wazeUrl } from "../lib/nav-links";
import { FALLBACK_LIMITS } from "../lib/plan-limits";
import { LEVELS, levelHeadingFor, levelLabelFor } from "../lib/rider-level";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL } from "../lib/surface-types";
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
/** Longer than this and the description collapses behind a "… more" toggle, as in the mock. */
const DESCRIPTION_CLAMP_CHARS = 140;

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

// EventDetail (the GET /events/:eventId shape) and CachedParticipant (one
// GET /events/:eventId/participants row — name/bib for the list, plus the approval and arrival
// axes the organizer sees) both live in lib/local-db.ts now. They are what gets persisted for
// offline use, so defining them there is what keeps the cache and this page from drifting
// apart. Nothing on either is inferred: every field comes straight off the server row
// (participant.controller.ts's toParticipantSummary).

/**
 * The organizer's quick-edit reduces each rider to two booleans, because that is what the
 * pencil actually offers: "cleared to ride?" and "turned up?". Both derive from real server
 * values only — these are the SAME readings the read-only badges below use, so the checkbox
 * state and the label can never disagree.
 */
function isApproved(registrationStatus: string): boolean {
  // "registered" is a rider on an event that needs no approval: already cleared. See
  // approvalStatus() below, which labels both the same way for the same reason.
  return registrationStatus === "approved" || registrationStatus === "registered";
}

function hasArrived(attendanceStatus: string): boolean {
  // "started" means they turned up AND set off — arrived, and then some. Treating it as
  // arrived is what stops the pencil from offering to "un-arrive" a rider already on the road.
  return attendanceStatus === "present" || attendanceStatus === "started";
}

/** One rider's unsaved edit — booleans, not server statuses, until Save translates them. */
interface RiderDraft {
  approved: boolean;
  arrived: boolean;
}

/**
 * "What status is this event actually showing as right now" — the server computes it
 * (event.effectiveStatus, see event.service.ts's computeEffectiveStatus) so every client
 * agrees without a cron job writing the real status back; the local past-due calc is the
 * fallback for the instant a cached summary is painted before the real fetch resolves.
 *
 * Module scope because both the render and the organizer quick-edit's finished-event lock need
 * the same answer, and two copies of this rule would eventually disagree.
 */
function computeDisplayStatus(event: EventDetail): {
  displayStatus: EventStatus;
  isPastDue: boolean;
} {
  const scheduledEnd = event.endsAt ?? event.startsAt;
  const isPastDue =
    scheduledEnd != null &&
    new Date(scheduledEnd) < new Date() &&
    event.status !== "finished" &&
    event.status !== "cancelled" &&
    event.status !== "live";
  return {
    displayStatus: event.effectiveStatus ?? (isPastDue ? "finished" : event.status),
    isPastDue,
  };
}

function draftFromServer(rider: CachedParticipant): RiderDraft {
  return {
    approved: isApproved(rider.registrationStatus),
    arrived: hasArrived(rider.attendanceStatus),
  };
}

type StatusTone = "ok" | "warn" | "bad";
interface RiderStatus {
  text: string;
  tone: StatusTone;
}

/**
 * The two organizer-only status lines per rider. Every label maps a value the server actually
 * sends (participant.controller.ts's toParticipantSummary, db/types.ts's REGISTRATION_STATUSES
 * / ATTENDANCE_STATUSES) — an unrecognised value is shown verbatim rather than guessed into
 * one of the buckets, so a new server status can never be silently mislabelled "Approved".
 */
function approvalStatus(registrationStatus: string): RiderStatus {
  switch (registrationStatus) {
    // "registered" is what a rider gets on an event that does NOT require approval, and
    // "approved" is what the organizer's approve action sets. For the only question this line
    // answers — is this rider cleared to ride? — both are yes. They stay distinct everywhere
    // else; this is presentation, not a merged field.
    case "registered":
    case "approved":
      return { text: "✓ Approved", tone: "ok" };
    case "waiting_approval":
      return { text: "Pending approval", tone: "warn" };
    case "rejected":
      return { text: "Rejected", tone: "bad" };
    default:
      return { text: registrationStatus, tone: "warn" };
  }
}

function arrivalStatus(attendanceStatus: string): RiderStatus {
  switch (attendanceStatus) {
    case "present":
      return { text: "✓ Arrived", tone: "ok" };
    // Already out on the road — arrived, and then some.
    case "started":
      return { text: "✓ Arrived · started", tone: "ok" };
    case "dns":
      return { text: "Did not start", tone: "bad" };
    case "unknown":
      return { text: "Not arrived", tone: "warn" };
    default:
      return { text: attendanceStatus, tone: "warn" };
  }
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
  // A plain list row has only `ownerId`, but the object cached straight from a POST /events /
  // status-transition response is a full EventDetail — it carries the real `owner`, `isOwner`
  // and `myParticipant`. Keep those when present so a freshly created event opens looking like
  // the owner's own event, not a stranger's, before the network refetch resolves.
  const rich = summary as Partial<EventDetail>;
  return {
    ...summary,
    requiresBib: rich.requiresBib ?? false,
    description: rich.description ?? null,
    finishedAt: rich.finishedAt ?? null,
    isOwner: rich.isOwner ?? (viewerId != null && viewerId === summary.ownerId),
    owner: rich.owner ?? null,
    requiresApproval: rich.requiresApproval ?? false,
    isPaused: rich.isPaused ?? false,
    effectiveStatus: rich.effectiveStatus ?? summary.status,
    showParticipants: rich.showParticipants ?? true,
    showLiveLocations: rich.showLiveLocations ?? true,
    myParticipant: rich.myParticipant ?? null,
    // A list summary carries no capacity — honest "not full, count unknown" until the real
    // GET /events/:eventId (which always sends all three) replaces this. The cap falls back to
    // the server's own default so "N / 50" doesn't flash a wrong ceiling.
    participantCount: rich.participantCount ?? 0,
    maxParticipants: rich.maxParticipants ?? FALLBACK_LIMITS.maxParticipantsPerEvent,
    isFull: rich.isFull ?? false,
  };
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectMessage = (location.state as { message?: string } | null)?.message ?? null;
  const { profile } = useAuth();
  // Which rider these offline caches belong to. Every read is scoped to it, so a cached ride
  // can never be served to a different account — see lib/local-db.ts.
  const viewerId = viewerKey(profile?.id);
  // Bumps once when the server goes from unreachable to reachable, re-running the loads below.
  const reconnectNonce = useConnectivityStore((s) => s.reconnectNonce);
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
  const [descriptionOpen, setDescriptionOpen] = useState(false);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger, not a value this effect reads — it changes only when the server goes from unreachable to reachable, which is exactly when this should refetch.
  useEffect(() => {
    // reconnectNonce: refetch the route the instant the server comes back, without the
    // viewer having to reload or navigate away and return.
    if (eventId) loadResults(eventId, viewerId);
  }, [eventId, loadResults, viewerId, reconnectNonce]);

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
  const [realRoster, setRealRoster] = useState<CachedParticipant[] | null>(null);
  // Pending-approval count, same fetch — surfaced as a badge below so the organizer notices a
  // join request without having to remember to check the Participants page. "Approve/reject"
  // itself already existed there (EventParticipantsPage.tsx); this just makes it visible from
  // the hub too — "if i request to join the creator need to see me request," asked for
  // directly.
  const [pendingCount, setPendingCount] = useState(0);
  // --- organizer quick-edit ---------------------------------------------------------------
  // A shortcut, not a replacement: EventParticipantsPage.tsx remains the full participants
  // screen (add/edit/remove, per-rider approve/reject, search). This exists so the common
  // event-day job — tick several riders off as approved/arrived — doesn't need a trip to
  // another page. Owner-only, and off entirely once the event is finished.
  const [editMode, setEditMode] = useState(false);
  // Keyed by participant id. Only riders the organizer actually touched need to be here, but
  // seeding every rider on entry keeps the render dead simple (no per-row fallback lookup) and
  // the diff at Save is what decides which ones are really changes.
  const [draft, setDraft] = useState<Record<number, RiderDraft>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Read by the background roster poll below. Deliberately a ref and NOT a dependency of that
  // effect: the effect clears the roster to null on every run, so re-running it on entering
  // edit mode would blank the very list the drafts were just seeded from.
  const editModeRef = useRef(false);
  editModeRef.current = editMode;
  // Polled, not one-shot — "we will not use soket so puling can be every 2-3 minutes," asked
  // for directly: there's no push channel for "a rider just requested to join," so this page
  // re-pulls on config.backgroundPollIntervalMs while it's open rather than only checking once
  // on load. Same setInterval/cleanup shape as LiveEventPage.tsx's position poll, just a much
  // longer interval since this isn't time-critical the way live tracking is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger, not a value this effect reads — it changes only when the server goes from unreachable to reachable, which is exactly when this should refetch.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setRealRiderCount(null);
    setRealRoster(null);
    setPendingCount(0);

    // Set once the roster has been applied from EITHER source, so a slow IndexedDB read can
    // never land on top of a fresher network response. A plain local, not state: it only has to
    // survive until this effect is torn down, and it must be readable synchronously.
    let applied = false;

    function apply(list: CachedParticipant[]) {
      applied = true;
      setRealRiderCount(list.length);
      setRealRoster(list);
      setPendingCount(list.filter((p) => p.registrationStatus === "waiting_approval").length);
    }

    async function poll() {
      if (!eventId) return;
      // Frozen during quick-edit: a background refresh landing mid-edit would move the baseline
      // the Save diff is computed against, and could silently turn "no change" into a change
      // (or the reverse). Save refetches immediately afterwards, so nothing is missed — the
      // list is at most one poll interval stale while the pencil is open.
      if (editModeRef.current) return;
      try {
        const list = await apiRequest<CachedParticipant[]>(`/events/${eventId}/participants`);
        if (cancelled) return;
        apply(list);
        // Persist the roster WITH both status axes, so an offline reopen still shows who is
        // approved and who has arrived — not just a list of names.
        void putCachedParticipants(eventId, viewerId, list);
      } catch {
        // Either this viewer may not see the list (403 — a real answer, and the honest
        // "unavailable" placeholder below is correct for it), or the server is unreachable.
        // Neither is a reason to throw away a roster this device already has: whatever is on
        // screen stays, and a later poll replaces it. Nothing is fabricated here — an empty
        // cache still renders the placeholder, never invented riders.
      }
    }

    // Cache first: the last roster this viewer actually received, painted before the network
    // is attempted, so a reopen with the server down is populated rather than "unavailable".
    void (async () => {
      const cached = await getCachedParticipants(eventId, viewerId);
      // Skipped if the network already answered — it winning the race with IndexedDB is a good
      // outcome, and older data must not overwrite fresher.
      if (cached && !cancelled && !applied) apply(cached.value);
    })();

    void poll();
    const id = window.setInterval(poll, config.backgroundPollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // reconnectNonce: pull a fresh roster as soon as the server is back.
  }, [eventId, viewerId, reconnectNonce]);

  // Real start list, name-sorted — see the fetch effect's doc comment above for why this is
  // the only rider list this page ever renders.
  const visibleRealRoster = useMemo(() => {
    if (!realRoster) return null;
    return [...realRoster].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [realRoster]);

  // --- organizer quick-edit: open / cancel / toggle / save ---------------------------------

  // A finished event is read-only for participant state, full stop — no pencil, and the
  // controls cannot be reached even if the event finishes (or the past-due rule kicks in)
  // while the pencil is already open. Computed from the same rule the render uses.
  const quickEditLocked = event == null || computeDisplayStatus(event).displayStatus === "finished";

  useEffect(() => {
    if (quickEditLocked) setEditMode(false);
  }, [quickEditLocked]);

  function openQuickEdit() {
    if (!realRoster) return;
    // Seed from real server values, so an untouched rider's checkbox already shows the truth
    // and the Save diff below sees "no change" for it.
    const seeded: Record<number, RiderDraft> = {};
    for (const rider of realRoster) seeded[rider.id] = draftFromServer(rider);
    setDraft(seeded);
    setSaveError(null);
    setEditMode(true);
  }

  function cancelQuickEdit() {
    // Discard: the draft is the only place unsaved ticks ever lived, and nothing was sent.
    setDraft({});
    setSaveError(null);
    setEditMode(false);
  }

  function toggleDraft(riderId: number, axis: "approved" | "arrived") {
    setDraft((previous) => {
      const current = previous[riderId];
      if (!current) return previous;
      return { ...previous, [riderId]: { ...current, [axis]: !current[axis] } };
    });
  }

  /**
   * Save. There is no bulk participant endpoint on the server, so this reuses the three
   * per-rider endpoints that already exist and are already used by EventParticipantsPage —
   * POST .../approve, POST .../reject, PATCH .../attendance. No server contract changes.
   *
   * Only genuine changes are sent: each rider's draft is diffed against the server row it was
   * seeded from, so tapping a checkbox twice sends nothing at all.
   *
   * The two calls for one rider run in sequence (approval, then arrival); different riders run
   * in parallel. Whatever happens, the roster is refetched afterwards, because the only honest
   * thing to show after a partial failure is what the server actually holds now.
   */
  async function saveQuickEdit() {
    if (!eventId || !realRoster || quickEditLocked) return;
    setSaveBusy(true);
    setSaveError(null);

    const changed = realRoster.flatMap((rider) => {
      const wanted = draft[rider.id];
      if (!wanted) return [];
      const current = draftFromServer(rider);
      const calls: (() => Promise<unknown>)[] = [];

      if (wanted.approved !== current.approved) {
        // Unchecking "Approved" REJECTS the rider — reject is the only "not approved" write
        // the server offers, and leaving the rider untouched instead would silently ignore the
        // organizer's tap. The control is labelled so this is not a surprise.
        calls.push(() =>
          apiRequest(
            `/events/${eventId}/participants/${rider.id}/${wanted.approved ? "approve" : "reject"}`,
            { method: "POST" },
          ),
        );
      }
      if (wanted.arrived !== current.arrived) {
        // "unknown", not "dns": the organizer is undoing a check-in, not declaring the rider a
        // did-not-start. DNS stays a deliberate action on the participants page.
        calls.push(() =>
          apiRequest(`/events/${eventId}/participants/${rider.id}/attendance`, {
            method: "PATCH",
            body: { status: wanted.arrived ? "present" : "unknown" },
          }),
        );
      }
      return calls.length > 0 ? [calls] : [];
    });

    let failed = 0;
    if (changed.length > 0) {
      const outcomes = await Promise.allSettled(
        changed.map(async (calls) => {
          for (const run of calls) await run();
        }),
      );
      failed = outcomes.filter((o) => o.status === "rejected").length;
    }

    // Refetch: the server is the only thing that knows what actually landed.
    let fresh: CachedParticipant[] | null = null;
    try {
      fresh = await apiRequest<CachedParticipant[]>(`/events/${eventId}/participants`);
      setRealRiderCount(fresh.length);
      setRealRoster(fresh);
      setPendingCount(fresh.filter((p) => p.registrationStatus === "waiting_approval").length);
      void putCachedParticipants(eventId, viewerId, fresh);
    } catch {
      // Offline or unreachable. What is on screen stays; the failure below (if any) still gets
      // reported, and the poll picks the roster back up once the pencil closes.
    }

    if (failed > 0) {
      setSaveError(
        failed === 1
          ? "One rider could not be updated. The list below shows the current server state."
          : `${failed} riders could not be updated. The list below shows the current server state.`,
      );
      // Stay in edit mode, reseeded from the fresh truth, so a retry starts from reality
      // rather than from a draft that half-applied.
      if (fresh) {
        const reseeded: Record<number, RiderDraft> = {};
        for (const rider of fresh) reseeded[rider.id] = draftFromServer(rider);
        setDraft(reseeded);
      }
    } else {
      setDraft({});
      setEditMode(false);
    }
    setSaveBusy(false);
  }

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    // Best available cached truth, in order. A full cached DETAIL is the real thing: it was a
    // GET /events/:eventId response to this very viewer, so isPaused/requiresApproval/
    // showParticipants and — the one that actually matters — myParticipant are the rider's own
    // real membership and approval state, not guesses.
    const cachedDetail = await getCachedEventDetail(eventId, viewerId);
    if (cachedDetail) {
      setEvent((previous) =>
        previous && previous.id === cachedDetail.value.id ? previous : cachedDetail.value,
      );
      setLoading(false);
    }

    // Only if this ride has never been opened on this device does the list-cached SUMMARY
    // stand in. It is a weaker source (see detailFromCachedSummary's honest defaults) and is
    // now a genuine last resort rather than the primary offline path it used to be.
    const cached = cachedDetail ? null : await getCachedEvent(eventId);
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
      // The offline copy of this ride, refreshed. Written only from a real server response.
      void putCachedEventDetail(eventId, viewerId, found);
    } catch (err) {
      // Cached data is on screen — a failed refresh must never blank it out. The global
      // OFFLINE banner (app/OfflineBanner.tsx) is what tells the rider it is last-synced.
      if (cachedDetail || cached) return;
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
  }, [eventId, profile?.id, viewerId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger, not a value this effect reads — it changes only when the server goes from unreachable to reachable, which is exactly when this should refetch.
  useEffect(() => {
    void load();
    // reconnectNonce re-runs this the moment the server comes back, so the page refreshes
    // itself out of its cached state without the rider touching anything.
  }, [load, reconnectNonce]);

  // Approval has no push channel yet. While this rider is waiting_approval, re-pull this
  // event detail in the background so the CTA/status flips to approved without a manual reload.
  useEffect(() => {
    if (!eventId) return;
    if (event?.myParticipant?.registrationStatus !== "waiting_approval") return;

    let cancelled = false;
    // Captured so the nested async function keeps the non-undefined narrowing from the guard
    // above — TypeScript drops it across the closure boundary.
    const id = eventId;
    async function pollPendingApproval() {
      try {
        const found = await apiRequest<EventDetail>(`/events/${id}`);
        if (cancelled) return;
        setEvent((previous) => mergeParticipantStatus(previous, found));
        useEventsStore.getState().upsertRide(found);
        void putCachedEventDetail(id, viewerId, found);
      } catch {
        // Keep current UI state; a later poll will retry.
      }
    }

    void pollPendingApproval();
    const timer = window.setInterval(pollPendingApproval, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventId, event?.myParticipant?.registrationStatus, viewerId]);

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
      // Now a participant — refresh My Rides so the joined-id set (eventsStore) includes this
      // ride and it shows on the home screen's My Rides tab without a manual reload.
      void useEventsStore.getState().loadMyRides(true);
    } catch (err) {
      // The server is authoritative on capacity — a 409 carrying the EVENT_FULL token means the
      // ride filled between paint and tap. Reload so isFull / participantCount (and the gated
      // button above) catch up to the truth.
      if (
        err instanceof ApiError &&
        (err.message.includes("EVENT_FULL") || err.code === "EVENT_FULL")
      ) {
        setRegisterError("This event is full.");
        await load();
      } else {
        setRegisterError(err instanceof ApiError ? err.message : "Could not register. Try again.");
      }
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

  // Hero cover. event.owner.cover is the organizer's own identity once the server carries it;
  // until then this resolves to exactly what it shows today. Same chain as the list cards —
  // see app/useOwnerCover.ts and lib/user-identity.ts.
  //
  // Must stay ABOVE the loading/error/no-event early returns below: it is a hook, so it has to
  // run on every render. It tolerates a null event — there is simply no owner to resolve yet.
  const ownerCoverOptions = useOwnerCover(event?.owner?.id ?? event?.ownerId, event?.owner?.cover);
  // Same for the organizer's avatar — so an organizer viewing their own ride sees the picture
  // they chose on the account page, not just their Google photo / initial.
  const ownerAvatarProps = useOwnerAvatar(
    event?.owner?.id ?? event?.ownerId,
    event?.owner?.avatarUrl,
    event?.owner?.avatar,
  );

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
  const { displayStatus, isPastDue } = computeDisplayStatus(event);
  // Every organizer/management control on this page hangs off this: the viewer owns the event
  // AND is currently in Organizer mode. In Rider mode the owner sees their own event exactly
  // as a rider would (no Edit / Start / Finish / gear menu / quick-edit) — server permissions
  // are unchanged, this only hides UI. See store/userModeStore.ts.
  // Owning an event is NOT hidden by the Rider/Organizer browse toggle: if the server says
  // you own this ride (event.isOwner, from GET /events/:id), you always see it as yours and
  // can manage it. The mode toggle only simplifies the GLOBAL surfaces (create/Find-Tracks
  // entry points, the "Created" tab) — see store/userModeStore.ts.
  const showOrganizerUi = event.isOwner;
  // Who gets the pencil: the organizer, on an event that is not finished. Non-owners never
  // see it, and a finished event is read-only for every rider's state (quickEditLocked above
  // closes the editor too, if the event finishes while it is open).
  const canQuickEdit = showOrganizerUi && displayStatus !== "finished";

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
  // Server value first — activityType is a real field on the event now (see EventSummary).
  // No "road" default any more: an event whose organizer picked no surface shows no surface,
  // rather than being labelled Road because that happened to be first in the list.
  const activityType = event.activityType ?? extras.activityType ?? null;
  const ActivityIcon = activityType ? SURFACE_TYPE_ICON[activityType] : null;
  // Same fallback chain EventCard.tsx/EventTile.tsx use on the list cards — a team or manual
  // club name the organizer explicitly picked on EventCreatePage.tsx (extras.organizerGroup)
  // wins; failing that, the real signed-in owner's name (event.ownerName — nickname, else
  // first+last, resolved server-side). An event with neither now shows NO organizer line at
  // all. There used to be a third fallback that invented a club name from the event id; that
  // is gone, because a made-up organization on a real ride is indistinguishable from the
  // truth to the rider reading it.
  // Only the "real owner" branch has a photo to show — a club/team name is not an account,
  // so there is no server avatar for it.
  const level = event.level ?? extras.level ?? null;
  // The organizer's own numbers (typed, or auto-filled from the route they picked) win over
  // the saved route's, because that is the figure they chose to publish for this ride. Null
  // when neither exists — the tile is then simply not drawn. Same fallback chain the card uses
  // (EventCard.tsx): the organizer's own numbers (extras / event.distanceKm|climbM) first, the
  // saved route's figures only as a last resort — so the hero shows exactly what the card does.
  const distanceKm = extras.distanceKm ?? event.distanceKm ?? results?.route?.distanceKm ?? null;
  const climbM = extras.climbM ?? event.climbM ?? results?.route?.elevationM ?? null;
  const levelIndex = level ? LEVELS.findIndex((l) => l.value === level) : -1;
  // event.owner is the real thing — see EventDetail.owner. A club/team name the organizer
  // typed on the create form still wins as the DISPLAY name (it is what they chose to ride
  // under), but the avatar only ever comes from a real account, never from a club string.
  const organizerIsRealOwner = !extras.organizerGroup && !!event.owner?.name;
  const organizer = extras.organizerGroup ?? event.owner?.name ?? null;
  // A real account gets the full identity chain (chosen pick incl. this device's local one for
  // the owner themselves); a club/team string is not an account, so it shows only its initial.
  const organizerAvatarProps = organizerIsRealOwner
    ? { ...ownerAvatarProps, seed: ownerAvatarProps.seed ?? organizer }
    : { avatarUrl: null, identity: null, localSelection: null, seed: organizer };
  const coverBackground = eventCoverBackground(
    event.id,
    extras.coverImageDataUrl,
    ownerCoverOptions,
  );
  const riderCount = realRiderCount;
  // Start-list capacity. event.participantCount is the authoritative "joined" count (approved +
  // pending) from GET /events/:eventId; the roster-length poll is only a pre-fetch stand-in for
  // the instant before that resolves (a cached-summary paint has participantCount 0). The cap
  // is the event owner's entitlement, also server-resolved. All capacity math is UX only — the
  // server enforces it and 409s (EVENT_FULL) on a join that would overflow.
  const participantCount = event.participantCount || riderCount || 0;
  const maxParticipants = event.maxParticipants || FALLBACK_LIMITS.maxParticipantsPerEvent;
  const eventFull = event.isFull || participantCount >= maxParticipants;
  const bucket = figmaStatus(displayStatus);
  const canEditNow =
    showOrganizerUi && displayStatus !== "live" && displayStatus !== "finished";
  // Who gets into the live page. The old gate here was `event.showLiveLocations` alone, which
  // hid the live map from the ride's own registered riders: show_live_locations defaults to
  // FALSE (plan/02-database-schema.md:195), so on a typical event nobody but the organizer
  // ever saw a way in. The server's actual rule is narrower than that flag suggests — per
  // 07-api-contract.md:372, GET /events/:eventId/live only 403s when the flag is off *and the
  // caller is not a member*. So a rider who joined this ride always belongs on that page, and
  // the flag only decides whether a passing non-member viewer does too.
  // `|| event.isOwner`: the owner can always reach their own live map. In Organizer mode this
  // is the "LIVE" button in the owner-actions row; in Rider mode that row is hidden, so the
  // owner falls through to the same rider-style LIVE entry below (gated on `!showOrganizerUi`).
  const canSeeLive =
    event.myParticipant != null || event.showLiveLocations || event.isOwner;

  // Owner never registers for their own ride; a rider who already finished/cancelled events
  // can't join either — same guard the old bottom card and sign-in link used.
  const showRiderCta =
    !event.isOwner && displayStatus !== "finished" && displayStatus !== "cancelled";

  return (
    <section className={styles.page}>
      {/* --- hero: colored placeholder (no real cover-image field yet, same honest-fallback
          rule as EventCard/EventTile) with the date/status pinned to its corners and the
          name/organizer overlaid at the bottom. ------------------------------------------ */}
      <div
        className={styles.hero}
        style={{ background: coverBackground, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        {ActivityIcon && <ActivityIcon className={styles.heroWatermark} aria-hidden="true" />}
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
            <span
              className={styles.statusPill}
              data-bucket={bucket}
              title={isPastDue ? "Automatically marked finished — the date has passed" : undefined}
            >
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
            {showOrganizerUi && (
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
              <Avatar className={styles.avatar} name={organizer} {...organizerAvatarProps} />
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

        {/* --- stat strip -------------------------------------------------------------------
            The SAME set the list card (EventCard.tsx) shows, from the SAME fields, so opening a
            ride from its card never loses information: Distance, Elevation, Est. Time,
            Difficulty, plus Weather here (the card has no room for it).

            A missing value shows "—" rather than dropping the tile — matching the card, and so
            the layout doesn't jump as `results`/`forecast` resolve. Est. Time reads "soon":
            there is still no duration field anywhere (event or route), so it is a placeholder,
            not data. Weather is real Open-Meteo (lib/weather.ts) or "No data" — never invented.
            -------------------------------------------------------------------------------- */}
        <div className={styles.statStrip}>
          <div className={styles.statTile}>
            <Ruler className={styles.statTileIcon} aria-hidden="true" />
            <span className={styles.statTileValue}>
              {distanceKm != null ? `${distanceKm} km` : "—"}
            </span>
            <span className={styles.statTileLabel}>Distance</span>
          </div>
          <div className={styles.statTile}>
            <Mountain className={styles.statTileIcon} aria-hidden="true" />
            <span className={styles.statTileValue}>{climbM != null ? `${climbM} m` : "—"}</span>
            <span className={styles.statTileLabel}>Elevation</span>
          </div>
          <div className={styles.statTile}>
            {level ? (
              <span className={styles.levelBars} aria-hidden="true">
                {LEVELS.map((l, i) => (
                  <span
                    key={l.value}
                    className={styles.levelBar}
                    data-level={l.value}
                    data-filled={i <= levelIndex}
                    style={{ height: `${6 + i * 3}px` }}
                  />
                ))}
              </span>
            ) : null}
            <span className={styles.statTileValue}>
              {level ? levelLabelFor(level, activityType) : "—"}
            </span>
            <span className={styles.statTileLabel}>{levelHeadingFor(activityType)}</span>
          </div>
          <div className={styles.statTile} data-pending>
            <span className={styles.statTileValue}>soon</span>
            <span className={styles.statTileLabel}>Est. Time</span>
          </div>
          <div className={styles.statTile} data-pending={!forecast || undefined}>
            <span className={styles.statTileValue}>
              {forecast
                ? `${Math.round((forecast.tempMinC + forecast.tempMaxC) / 2)}°${forecast.emoji ? ` ${forecast.emoji}` : ""}`
                : "No data"}
            </span>
            <span className={styles.statTileLabel}>Weather</span>
          </div>
        </div>

        {/* --- chip row: surface / visibility / approval ------------------------------------
            The reference design's three chips. Status is NOT repeated here — the hero already
            carries it, and the mock's chip row doesn't show it. Difficulty moved into the stat
            strip above, where the mock puts it.

            "Approval Required" is shown to everyone now, not just the owner: requiresApproval
            is real data on this response, and whether joining needs approval is exactly what a
            rider deciding to tap "I'M IN" needs to know. --------------------------------- */}
        <div className={styles.chipRow}>
          {activityType && ActivityIcon && (
            <span className={styles.chip} data-surface={activityType}>
              <ActivityIcon width={13} height={13} aria-hidden="true" />
              {SURFACE_TYPE_LABEL[activityType]}
            </span>
          )}
          <span className={styles.chip} data-kind={event.visibility}>
            {event.visibility === "private" ? "Private" : "Public"}
          </span>
          {event.requiresApproval && (
            <span
              className={styles.chip}
              data-kind="approval"
              title="Riders who join must be approved before they're in"
            >
              Approval Required
            </span>
          )}
          {displayStatus === "cancelled" && (
            <span className={styles.chip} data-kind="cancelled">
              Cancelled
            </span>
          )}
          {event.isPaused && (
            <span
              className={styles.chip}
              data-kind="paused"
              title="The organizer has paused live tracking"
            >
              Paused
            </span>
          )}
          {eventFull && (
            <span
              className={styles.chip}
              data-kind="full"
              title="This event has reached its participant limit"
            >
              Event Full
            </span>
          )}
        </div>

        {/* --- owner actions: Edit + Start/LIVE/Finish — the rest (Participants/Groups/Cancel)
            live in the "more" sheet opened from the hero's gear icon. Organizer mode only —
            in Rider mode the owner gets the rider LIVE entry below instead. ---------------- */}
        {showOrganizerUi && (
          <div className={styles.ownerActions}>
            {confirming ? (
              <div className={styles.confirmBar}>
                <span className={styles.confirmMessage}>
                  {confirming === "live"
                    ? "Go live now? Riders will see the ride as started."
                    : "Finish this event now? This can't be undone."}
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
                    {busy ? "…" : confirming === "live" ? "Go live" : "Finish event"}
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
                      Finish
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
        {displayStatus === "live" && !showOrganizerUi && canSeeLive && (
          <div className={styles.ownerActions}>
            <Link className={styles.startBtn} to={`/events/live/${event.id}`}>
              LIVE
            </Link>
          </div>
        )}

        {/* Only kept for the paused case now, where it explains why the markers on that map
            are standing still. The "live now" version of this card was redundant next to the
            button above. */}
        {displayStatus === "live" && !showOrganizerUi && canSeeLive && event.isPaused && (
          <LiveTracking eventId={event.id} isPaused={event.isPaused} />
        )}

        {/* --- organizer -------------------------------------------------------------------
            The reference design gives the organizer their own card. It renders only when there
            is a real organizer to name: event.owner.name from the server, or the club/team the
            organizer typed on the create form. An event with neither shows no card at all —
            there used to be a third fallback that invented a club name from the event id, and
            a made-up organization on a real ride is indistinguishable from the truth to the
            rider reading it.

            The mock has a chevron suggesting the row opens something. There is no organizer
            profile anywhere in this app, so it is not drawn: an affordance that goes nowhere is
            worse than none. ---------------------------------------------------------------- */}
        {organizer && (
          <div className={styles.organizerCard}>
            <Avatar
              className={styles.organizerAvatar}
              name={organizer}
              {...organizerAvatarProps}
            />
            <div className={styles.organizerText}>
              <span className={styles.organizerLabel}>Organized by</span>
              <span className={styles.organizerName}>
                {organizer}
                <span className={styles.organizerBadge}>Organizer</span>
              </span>
            </div>
          </div>
        )}

        {/* --- description ------------------------------------------------------------------
            Collapsed to a few lines with a "… more" toggle, as in the mock, but only when the
            text is actually long enough to need it. */}
        {event.description && (
          <div className={styles.description}>
            <p className={styles.descriptionText} data-expanded={descriptionOpen}>
              {event.description}
            </p>
            {event.description.length > DESCRIPTION_CLAMP_CHARS && (
              <button
                type="button"
                className={styles.descriptionToggle}
                onClick={() => setDescriptionOpen((open) => !open)}
              >
                {descriptionOpen ? "less" : "… more"}
              </button>
            )}
          </div>
        )}

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

            {/* --- route preview ------------------------------------------------------------
                The mock puts the route's distance and elevation in this card's header beside
                the title, and an ELEVATION PROFILE chart under the map. The chart is not built:
                drawing one needs an elevation value per point along the route, and a route
                carries only [lat, lng] pairs plus a single total climb (lib/event-route.ts,
                matching the server's route schema). There is no series to plot. A profile drawn
                from anything else would be an invented picture of terrain the rider is about to
                ride, so this shows the real map and the real total, and nothing more.

                The whole card is skipped when the event has no route, instead of an empty
                frame. ------------------------------------------------------------------- */}
            {results.route && (
              <div className="card stack">
                <div className={styles.routeHeader}>
                  <p className={styles.infoLabel}>Route Preview</p>
                  <span className={styles.routeMeta}>
                    {results.route.distanceKm != null && (
                      <span className={styles.routeMetaItem}>
                        <Ruler width={13} height={13} aria-hidden="true" />
                        {results.route.distanceKm} km
                      </span>
                    )}
                    {results.route.elevationM != null && (
                      <span className={styles.routeMetaItem}>
                        <Mountain width={13} height={13} aria-hidden="true" />
                        {results.route.elevationM} m
                      </span>
                    )}
                  </span>
                </div>
                <Suspense fallback={<div className="row muted">Loading the map…</div>}>
                  <RouteMap points={results.route.points} />
                </Suspense>
              </div>
            )}

            {/* --- info strip -------------------------------------------------------------
                The mock's four-cell strip: Start · Meeting Point · Finish · Participants.

                FINISH is not rendered. The mock shows "~ 09:15 AM", which is the start plus an
                estimated duration — and no duration exists anywhere (see the stat strip above).
                An estimated finish on a group ride is the kind of number people plan pickups
                around, so it is absent rather than guessed.

                PARTICIPANTS shows the real count only. The mock's "1 / 25" implies a capacity;
                no capacity column exists server-side, so there is nothing to divide by.

                Each cell renders only with a real value, and the strip disappears when none of
                them do. ------------------------------------------------------------------ */}
            {(event.startsAt || event.location || event.participantCount != null) && (
              <div className={styles.infoStrip}>
                {event.startsAt && (
                  <div className={styles.infoCell}>
                    <span className={styles.infoCellHead}>
                      <CalendarDays width={13} height={13} aria-hidden="true" />
                      Start
                    </span>
                    <span className={styles.infoCellValue}>
                      {formatLocalDateTime(event.startsAt)}
                    </span>
                  </div>
                )}
                {event.location && (
                  <div className={styles.infoCell}>
                    <span className={styles.infoCellHead}>
                      <MapPin width={13} height={13} aria-hidden="true" />
                      Meeting Point
                    </span>
                    <span className={styles.infoCellValue}>{event.location}</span>
                    {(wazeHref || googleMapsHref) && (
                      <span className={styles.infoCellLinks}>
                        {wazeHref && (
                          <a
                            href={wazeHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.navLink}
                            aria-label="Navigate with Waze"
                          >
                            <Navigation width={12} height={12} aria-hidden="true" />
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
                            <MapPin width={12} height={12} aria-hidden="true" />
                            Maps
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                )}
                <div className={styles.infoCell}>
                  <span className={styles.infoCellHead}>
                    <Users width={13} height={13} aria-hidden="true" />
                    Participants
                  </span>
                  <span className={styles.infoCellValue}>
                    {participantCount} / {maxParticipants} participants
                  </span>
                </div>
              </div>
            )}

            {/* "if riders are published we will see them" — the organizer's own "Riders list
                open to view" switch (EventCreatePage.tsx) gates this for everyone else; the
                organizer still sees their own start list regardless, same as every other
                owner-only visibility rule on this page. */}
            {(event.isOwner || event.showParticipants) && (
              <div className="card stack">
                <div className={styles.ridersHeader}>
                  <p className={styles.infoLabel}>
                    Riders ({visibleRealRoster ? visibleRealRoster.length : "…"})
                  </p>
                  {/* The pencil: organizer only, and gone entirely once the event is finished.
                      A shortcut for the event-day job of ticking riders off — the full
                      participants screen (add/remove/search/per-rider approve) is still one tap
                      away below. */}
                  {canQuickEdit && !editMode && (
                    <button
                      type="button"
                      className={styles.ridersEditBtn}
                      onClick={openQuickEdit}
                      aria-label="Edit rider approval and arrival"
                      title="Edit approval / arrival"
                    >
                      <Pencil width={15} height={15} aria-hidden="true" />
                    </button>
                  )}
                  {canQuickEdit && editMode && (
                    <div className={styles.ridersEditActions}>
                      <button
                        type="button"
                        className={styles.quickEditCancelBtn}
                        disabled={saveBusy}
                        onClick={cancelQuickEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.quickEditSaveBtn}
                        disabled={saveBusy}
                        onClick={() => void saveQuickEdit()}
                      >
                        {saveBusy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {editMode && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                    Tap to set each rider, then Save. Clearing Approved rejects that rider.
                  </p>
                )}
                {saveError && (
                  <p className="banner banner--error" role="alert">
                    {saveError}
                  </p>
                )}
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
                          // Approval/arrival are the organizer's view of the start list —
                          // asked for directly ("the organizer must see more than just the
                          // participant names"). Riders see the plain list they always saw;
                          // the approve/reject controls themselves stay on the Participants
                          // page, this is read-only status.
                          const approval = showOrganizerUi
                            ? approvalStatus(rider.registrationStatus)
                            : null;
                          const arrival = showOrganizerUi
                            ? arrivalStatus(rider.attendanceStatus)
                            : null;
                          // Undefined for a rider who joined after the pencil was opened —
                          // that row simply stays read-only until the next Save/Cancel reseeds.
                          const riderDraft = draft[rider.id];
                          return (
                            <div key={rider.id} className={styles.realRiderRow}>
                              <Avatar
                                className={styles.realRiderAvatar}
                                name={rider.name}
                                avatarUrl={rider.avatarUrl}
                                identity={rider.avatar}
                                seed={String(rider.id)}
                              />
                              <div className={styles.realRiderMain}>
                                <span className={styles.realRiderName}>
                                  {rider.name?.trim() || "Unnamed rider"}
                                  {isMe && <span className="muted"> (ME)</span>}
                                  {rider.bib && <span className="muted"> #{rider.bib}</span>}
                                </span>
                                {/* Edit mode swaps the read-only badges for controls, for the
                                    organizer only. Outside edit mode these statuses are exactly
                                    as read-only as they were before. */}
                                {editMode && riderDraft ? (
                                  <span className={styles.riderStatusRow}>
                                    <button
                                      type="button"
                                      className={styles.riderToggle}
                                      data-on={riderDraft.approved}
                                      aria-pressed={riderDraft.approved}
                                      disabled={saveBusy}
                                      onClick={() => toggleDraft(rider.id, "approved")}
                                    >
                                      {riderDraft.approved ? (
                                        <CheckCircle2 width={16} height={16} aria-hidden="true" />
                                      ) : (
                                        <Circle width={16} height={16} aria-hidden="true" />
                                      )}
                                      Approved
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.riderToggle}
                                      data-on={riderDraft.arrived}
                                      aria-pressed={riderDraft.arrived}
                                      disabled={saveBusy}
                                      onClick={() => toggleDraft(rider.id, "arrived")}
                                    >
                                      {riderDraft.arrived ? (
                                        <CheckCircle2 width={16} height={16} aria-hidden="true" />
                                      ) : (
                                        <Circle width={16} height={16} aria-hidden="true" />
                                      )}
                                      Arrived
                                    </button>
                                  </span>
                                ) : (
                                  approval &&
                                  arrival && (
                                    <span className={styles.riderStatusRow}>
                                      <span
                                        className={styles.riderStatus}
                                        data-tone={approval.tone}
                                      >
                                        {approval.text}
                                      </span>
                                      <span
                                        className={styles.riderStatus}
                                        data-tone={arrival.tone}
                                      >
                                        {arrival.text}
                                      </span>
                                    </span>
                                  )
                                )}
                              </div>
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
          ) : eventFull ? (
            // Server validation still decides — this only stops a rider queuing for a join the
            // server will 409 (EVENT_FULL). A rider already in is handled by the branch above
            // and keeps their status + Leave.
            <button type="button" className={styles.ctaBtn} disabled>
              Event Full
            </button>
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
      {menuOpen && showOrganizerUi && (
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
            {/* Edit and Start/LIVE/Finish both live in the owner action row above this sheet —
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
