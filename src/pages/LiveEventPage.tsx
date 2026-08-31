/**
 * The live map — a full-screen, map-first screen, fully separate from EventDetailPage. Reached
 * only via its "LIVE" button (owner) or "Open live map" link (everyone else). It is rendered
 * OUTSIDE the AppShell chrome (see App.tsx) so the map is genuinely the whole screen — no app
 * header, no footer, nothing to tap by accident. The only way back is the Back control in the
 * top-left, which returns to the event page.
 *
 * Route:  /events/live/:eventId
 * Loads:  GET /events/:eventId (name, isOwner, isPaused, status, myParticipant, route via
 *         resultsStore), GET /events/:eventId/participants (roster), then polls
 *         GET /events/:eventId/live on config.livePollIntervalMs.
 *
 * Field-use rules (the creator glances at this mid-ride, taps once, rides on):
 *   - the map viewport is stable — it never auto-pans on a poll; only the user moves it;
 *   - a small number of large, one-tap controls: Center, Riders, Location sharing, Back;
 *   - "Center on me" and "Location sharing" are SEPARATE controls (different jobs);
 *   - Riders opens a half-screen bottom sheet; tapping outside it closes it; the map stays
 *     visible behind it.
 *
 * Location sharing:
 *   - a PARTICIPATING creator auto-starts the existing broadcast on entry (permission asked
 *     once, via the existing flow) — unless they manually stopped it this session;
 *   - a NON-participating creator (organiser only, no myParticipant row) never broadcasts and
 *     is never asked for GPS; their map centres on the route instead.
 *   Transmission reuses app/useLocationBroadcast.ts → the frozen POST
 *   /events/:eventId/locations/batch endpoint. One watcher, no SOS. See
 *   ELNINO_CLIENT_AGENT_SOURCE_OF_TRUTH.md §14.
 *
 * Route progress (creator): the creator's own GPS is projected onto the route polyline
 * (lib/geo.ts nearestPointOnRoute) and the travelled portion is drawn darker over the lighter
 * base line — never a straight line from the start.
 */

import {
  ArrowLeft,
  Check,
  LocateFixed,
  Moon,
  Navigation,
  Radio,
  Share2,
  Sun,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import {
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { initialOf, placeholderColorVar } from "../app/event-visuals";
import type { RecenterCommand } from "../app/LiveRidersMap";
import { useLocationBroadcast } from "../app/useLocationBroadcast";
import { useMyIdentity } from "../app/useMyIdentity";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";
import { useConnectivityStore } from "../lib/connectivity";
import { haversineDistanceKm } from "../lib/geo";
import type { LiveRider } from "../lib/live-types";
import {
  type CachedParticipant,
  type EventStatus,
  type EventSummary,
  getCachedEvent,
  getCachedEventDetail,
  getCachedLiveRiders,
  getCachedParticipants,
  putCachedLiveRiders,
  viewerKey,
} from "../lib/local-db";
import { isLocationManuallyStopped } from "../lib/location-broadcast";
import { formatAge } from "../lib/time";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { resolveUserAvatar, type UserVisualAsset } from "../lib/user-identity";
import { type EventGroup, useEventGroupsStore } from "../store/eventGroupsStore";
import { useResultsStore } from "../store/resultsStore";
import styles from "./LiveEventPage.module.css";

const LiveRidersMap = lazy(() => import("../app/LiveRidersMap"));
const ShareEventSheet = lazy(() =>
  import("../app/ShareEventSheet").then((m) => ({ default: m.ShareEventSheet })),
);

const MAX_RIDERS_FOR_NON_OWNER = 5;
const EMPTY_GROUPS: EventGroup[] = [];

interface LiveEventInfo {
  id: string;
  code: string;
  name: string;
  isOwner: boolean;
  isPaused: boolean;
  showLiveLocations: boolean;
  startsAt: string | null;
  /** Only used to fill in the share invitation's "where" line (lib/share-invite.ts). Nothing on
   *  the map needs it — the map has real coordinates — so a missing value simply drops that
   *  line from the message. */
  location: string | null;
  myParticipant: { id: number } | null;
  status: EventStatus;
  effectiveStatus: EventStatus;
}

function liveInfoFromCachedSummary(summary: EventSummary, viewerId: number | null): LiveEventInfo {
  return {
    id: summary.id,
    code: summary.code,
    name: summary.name,
    isOwner: viewerId != null && viewerId === summary.ownerId,
    isPaused: false,
    showLiveLocations: true,
    startsAt: summary.startsAt,
    location: summary.location,
    myParticipant: null,
    status: summary.status,
    effectiveStatus: summary.status,
  };
}

interface RosterEntry {
  id: number;
  name: string | null;
  avatarUrl: string | null;
  avatar?: UserVisualAsset | null;
  bib: string | null;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function LiveEventPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();
  const viewerId = viewerKey(profile?.id);

  // The viewer's own face for their position marker on the map — the same resolution chain the
  // header avatar uses (chosen upload/preset → Google photo → nothing). Null falls back to the
  // initial inside the marker.
  const me = useMyIdentity();
  const selfAvatarUrl = resolveUserAvatar(
    { avatar: me.avatar, avatarUrl: me.avatarUrl },
    me.localAvatar,
    me.seed,
  ).url;
  const selfInitial = initialOf(me.displayName);
  const reconnectNonce = useConnectivityStore((s) => s.reconnectNonce);
  const serverReachable = useConnectivityStore((s) => s.serverReachable);
  const online = useOnlineStatus();
  const connected = online && serverReachable;

  const [event, setEvent] = useState<LiveEventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const results = useResultsStore((s) => s.results);
  const loadResults = useResultsStore((s) => s.loadResults);
  const groups = useEventGroupsStore((s) =>
    eventId && s.byEvent[eventId] ? s.byEvent[eventId] : EMPTY_GROUPS,
  );

  const [riders, setRiders] = useState<LiveRider[]>([]);
  const [paused, setPaused] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const [selectedRiderIds, setSelectedRiderIds] = useState<number[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"riders" | "groups">("riders");

  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // One-shot recenter request handed to the map. nonce 0 = "never asked" (the map frames the
  // route itself on mount). mode picks the target when we DO ask.
  const [recenter, setRecenter] = useState<RecenterCommand>({ nonce: 0, mode: "route" });

  // Day / dark tiles, toggled from the control stack. Defaults to "day" — the same plain OSM
  // tiles the ride page shows — and is remembered per device.
  const [mapTheme, setMapTheme] = useState<"day" | "dark">(() => {
    try {
      return localStorage.getItem("elnino.live-map-theme") === "dark" ? "dark" : "day";
    } catch {
      return "day";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("elnino.live-map-theme", mapTheme);
    } catch {
      /* storage unavailable — the choice just isn't remembered */
    }
  }, [mapTheme]);

  const prevFixRef = useRef<Map<number, { distanceKm: number; at: number }>>(new Map());
  const [riderSpeeds, setRiderSpeeds] = useState<Map<number, number>>(new Map());

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger
  useEffect(() => {
    if (eventId) loadResults(eventId, viewerId);
  }, [eventId, loadResults, viewerId, reconnectNonce]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    async function load() {
      if (!eventId) return;
      setLoading(true);
      setError(null);

      const cachedDetail = await getCachedEventDetail(eventId, viewerId);
      if (cachedDetail && !cancelled) {
        setEvent(cachedDetail.value);
        setPaused(cachedDetail.value.isPaused);
        setLoading(false);
      }

      const cached = cachedDetail ? null : await getCachedEvent(eventId);
      if (cached && !cancelled) {
        const asLiveInfo = liveInfoFromCachedSummary(cached, profile?.id ?? null);
        setEvent(asLiveInfo);
        setPaused(asLiveInfo.isPaused);
        setLoading(false);
      }

      try {
        const found = await apiRequest<LiveEventInfo>(`/events/${eventId}`);
        if (cancelled) return;
        setEvent(found);
        setPaused(found.isPaused);
      } catch (err) {
        if (cancelled) return;
        if (cachedDetail || cached) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "This event is private."
            : err instanceof ApiError && err.status === 404
              ? "Event not found."
              : "Could not load this event.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, profile?.id, viewerId, reconnectNonce]);

  // Best-effort roster — a viewer who can't see the list still gets the map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const id = eventId;
    let applied = false;

    void (async () => {
      const cachedRoster = await getCachedParticipants(id, viewerId);
      if (cachedRoster && !cancelled && !applied) {
        applied = true;
        setRoster(cachedRoster.value);
      }
    })();

    apiRequest<CachedParticipant[]>(`/events/${id}/participants`)
      .then((list) => {
        if (cancelled) return;
        applied = true;
        setRoster(list);
      })
      .catch(() => {
        if (!cancelled && !applied) setRosterNote("The rider list isn't open for this event.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, viewerId, reconnectNonce]);

  const isOwner = event?.isOwner ?? false;
  const isParticipant = event?.myParticipant?.id != null;

  // --- location transmission --------------------------------------------------------------
  const effectiveStatus = event ? (event.effectiveStatus ?? event.status) : null;
  const eventIsLive = effectiveStatus === "live";
  const eventIsFinished = effectiveStatus === "finished" || effectiveStatus === "cancelled";
  const broadcast = useLocationBroadcast({
    eventId,
    participantId: event?.myParticipant?.id ?? null,
    eventIsLive,
    eventIsFinished,
  });
  const selfPosition = broadcast.selfPosition;
  const sharing = broadcast.status === "sharing" || broadcast.status === "requesting";
  const canShare = isParticipant && eventIsLive && !eventIsFinished;
  const geoError =
    broadcast.status === "denied"
      ? "Location is off for this site. Turn it on in your browser settings, then tap Share again."
      : broadcast.status === "unsupported"
        ? "This device does not support location sharing."
        : null;

  // Auto-start the EXISTING broadcast on entering LIVE — participating creator only, live and
  // not finished, not manually stopped this session. The hook's start() surfaces the
  // permission prompt once via the existing flow; a "denied" result stops here (status leaves
  // "off"), so this never loops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: broadcast.start is a stable useCallback
  useEffect(() => {
    if (!eventId || !isParticipant) return;
    if (!eventIsLive || eventIsFinished) return;
    if (broadcast.status !== "off") return;
    if (isLocationManuallyStopped(eventId)) return;
    broadcast.start();
  }, [eventId, isParticipant, eventIsLive, eventIsFinished, broadcast.status]);

  // A finished ride left open in the background can go stale — re-pull the event on return to
  // the foreground so the transmission conditions stay honest.
  useEffect(() => {
    if (!eventId) return;
    const refetch = () => {
      if (document.visibilityState === "hidden") return;
      apiRequest<LiveEventInfo>(`/events/${eventId}`)
        .then((found) => {
          setEvent(found);
          setPaused(found.isPaused);
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", refetch);
    };
  }, [eventId]);

  // A non-owner's rider selection is deliberately left empty: the "track other riders" picker
  // is hidden for them for now (see the riders sheet below), so they only ever see the route
  // and their own position. Owners poll everyone regardless of this list.

  // Initial framing: a participating creator with a real fix gets centred on themselves ONCE.
  // Everyone else keeps the route framing the map does on mount. Never re-fires (ref-guarded),
  // so it can't fight a manual pan.
  const didInitialSelfCenter = useRef(false);
  useEffect(() => {
    if (didInitialSelfCenter.current) return;
    if (!isParticipant || !selfPosition) return;
    didInitialSelfCenter.current = true;
    setRecenter((r) => ({ nonce: r.nonce + 1, mode: "self" }));
  }, [isParticipant, selfPosition]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger
  useEffect(() => {
    if (!eventId || !event) return;
    let cancelled = false;
    const liveEventId = eventId;

    if (isOwner || selectedRiderIds.length > 0) {
      void (async () => {
        const cached = await getCachedLiveRiders(liveEventId, viewerId);
        if (!cached || cancelled) return;
        setRiders((previous) => (previous.length > 0 ? previous : cached.value.riders));
      })();
    }

    async function poll() {
      if (!isOwner && selectedRiderIds.length === 0) {
        if (!cancelled) setRiders([]);
        return;
      }
      const query = isOwner ? "" : `?riders=${selectedRiderIds.join(",")}`;
      try {
        const found = await apiRequest<{ riders: LiveRider[]; paused: boolean }>(
          `/events/${eventId}/live${query}`,
        );
        if (cancelled) return;
        setRiders(found.riders);
        setPaused(found.paused);
        void putCachedLiveRiders(liveEventId, viewerId, found.riders, found.paused);

        setRiderSpeeds((prevSpeeds) => {
          const nextSpeeds = new Map(prevSpeeds);
          for (const r of found.riders) {
            if (r.distanceKm == null || r.recordedAt == null) continue;
            const at = new Date(r.recordedAt).getTime();
            const prev = prevFixRef.current.get(r.participantId);
            if (prev && at > prev.at) {
              const dtHours = (at - prev.at) / 3_600_000;
              const dKm = r.distanceKm - prev.distanceKm;
              if (dtHours > 0 && dKm >= 0) nextSpeeds.set(r.participantId, dKm / dtHours);
            }
            prevFixRef.current.set(r.participantId, { distanceKm: r.distanceKm, at });
          }
          return nextSpeeds;
        });
      } catch {
        // Keep the last known positions on a transient failure.
      }
    }

    // One last pull to show the final positions, then no interval — a finished/cancelled ride
    // has nothing moving. The focus/visibility refetch above is what flips this back off if
    // the status ever changes underneath us.
    void poll();
    if (eventIsFinished)
      return () => {
        cancelled = true;
      };
    const id = window.setInterval(poll, config.livePollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventId, event, isOwner, selectedRiderIds, viewerId, reconnectNonce, eventIsFinished]);

  function toggleRider(id: number) {
    setSelectedRiderIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (!isOwner && ids.length >= MAX_RIDERS_FOR_NON_OWNER) return ids;
      return [...ids, id];
    });
  }

  function selectAllRiders() {
    if (!roster) return;
    const ids = roster.map((r) => r.id);
    setSelectedRiderIds(isOwner ? ids : ids.slice(0, MAX_RIDERS_FOR_NON_OWNER));
  }

  function handleCenter() {
    setRecenter((r) => ({
      nonce: r.nonce + 1,
      mode: isParticipant && selfPosition ? "self" : "route",
    }));
  }

  // --- bottom-sheet swipe-to-close ------------------------------------------------------
  const dragStartY = useRef<number | null>(null);
  const [dragDy, setDragDy] = useState(0);
  function onGrabStart(e: ReactPointerEvent) {
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGrabMove(e: ReactPointerEvent) {
    if (dragStartY.current == null) return;
    setDragDy(Math.max(0, e.clientY - dragStartY.current));
  }
  function onGrabEnd() {
    if (dragDy > 70) setSheetOpen(false);
    dragStartY.current = null;
    setDragDy(0);
  }

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const selectedSet = useMemo(() => new Set(selectedRiderIds), [selectedRiderIds]);
  const ridersById = useMemo(() => new Map(riders.map((r) => [r.participantId, r])), [riders]);
  const capReached = !isOwner && selectedRiderIds.length >= MAX_RIDERS_FOR_NON_OWNER;
  const orderedRoster = useMemo(() => {
    if (!roster) return null;
    const meId = event?.myParticipant?.id ?? null;
    if (meId === null) return roster;
    return [...roster].sort((a, b) => {
      if (a.id === meId) return -1;
      if (b.id === meId) return 1;
      return 0;
    });
  }, [roster, event?.myParticipant?.id]);

  const leaderDistance = riders.reduce((max, r) => Math.max(max, r.distanceKm ?? 0), 0);
  const myDistance = event?.myParticipant
    ? (ridersById.get(event.myParticipant.id)?.distanceKm ?? null)
    : null;
  const progressKm = myDistance ?? (leaderDistance > 0 ? leaderDistance : null);
  const elapsedMs = event?.startsAt ? Math.max(0, now - new Date(event.startsAt).getTime()) : null;
  const remainingKm =
    results?.route?.distanceKm != null && progressKm != null
      ? Math.max(0, results.route.distanceKm - progressKm)
      : null;

  if (loading) {
    return (
      <div className={styles.centeredState}>
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading live map…</span>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className={styles.centeredState}>
        <p className="banner banner--error" role="alert">
          {error ?? "Event not found."}
        </p>
        {eventId && (
          <Link className="button button--quiet" to={`/events/${eventId}`}>
            Back to event
          </Link>
        )}
      </div>
    );
  }

  const ridersCount = roster ? roster.length : riders.length;

  return (
    <div className={styles.screen}>
      {/* --- the map fills the whole screen ------------------------------------------- */}
      <Suspense fallback={<div className={styles.centeredState}>Loading the map…</div>}>
        <LiveRidersMap
          riders={riders}
          routePoints={results?.route?.points ?? []}
          selfPosition={selfPosition}
          selfParticipantId={event.myParticipant?.id ?? null}
          selfAvatarUrl={selfAvatarUrl}
          selfInitial={selfInitial}
          showOthers={showOthers}
          selectedRiderIds={selectedRiderIds}
          onToggleRider={toggleRider}
          recenter={recenter}
          mapTheme={mapTheme}
        />
      </Suspense>

      {/* --- top bar --------------------------------------------------------------------- */}
      <div className={styles.topBar}>
        <Link to={`/events/${event.id}`} className={styles.backBtn} aria-label="Exit live map">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={styles.topInfo}>
          <span className={styles.livePill} data-paused={paused || eventIsFinished || undefined}>
            {eventIsFinished ? "Finished" : paused ? "Paused" : "Live"}
          </span>
          <span className={styles.topTitle}>{event.name}</span>
        </div>
        {!connected && (
          <span className={styles.offlineChip} role="status">
            <WifiOff aria-hidden="true" width={13} height={13} />
            Offline
          </span>
        )}
      </div>

      {/* --- glance strip: elapsed + remaining ---------------------------------------- */}
      {(elapsedMs != null || remainingKm != null) && (
        <div className={styles.glance}>
          {elapsedMs != null && (
            <div className={styles.glanceCell}>
              <span className={styles.glanceValue}>{formatElapsed(elapsedMs)}</span>
              <span className={styles.glanceLabel}>Elapsed</span>
            </div>
          )}
          {remainingKm != null && (
            <div className={styles.glanceCell}>
              <span className={styles.glanceValue}>{remainingKm.toFixed(0)} km</span>
              <span className={styles.glanceLabel}>Remaining</span>
            </div>
          )}
        </div>
      )}

      {paused && (
        <div className={styles.pausedBanner} role="status">
          <Radio width={14} height={14} aria-hidden="true" />
          Paused by organizer
        </div>
      )}

      {geoError && <div className={styles.geoError}>{geoError}</div>}

      {/* --- the control stack (few, large, one tap) -------------------------------- */}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => setMapTheme((t) => (t === "day" ? "dark" : "day"))}
          aria-label={mapTheme === "day" ? "Switch to dark map" : "Switch to day map"}
        >
          {mapTheme === "day" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          <span className={styles.controlLabel}>{mapTheme === "day" ? "Dark" : "Day"}</span>
        </button>

        <button
          type="button"
          className={styles.control}
          onClick={handleCenter}
          aria-label={
            isParticipant && selfPosition ? "Center map on me" : "Center map on the route"
          }
        >
          <LocateFixed aria-hidden="true" />
          <span className={styles.controlLabel}>Center</span>
        </button>

        <button
          type="button"
          className={styles.control}
          onClick={() => setSheetOpen(true)}
          aria-label="Show riders"
          aria-haspopup="dialog"
        >
          <UsersRound aria-hidden="true" />
          <span className={styles.controlLabel}>
            Riders{ridersCount > 0 ? ` ${ridersCount}` : ""}
          </span>
        </button>

        <button
          type="button"
          className={styles.control}
          data-active={sharing || undefined}
          onClick={() => (sharing ? broadcast.stop() : broadcast.start())}
          disabled={!sharing && !canShare}
          aria-pressed={broadcast.status === "sharing"}
          aria-label={sharing ? "Stop sharing my location" : "Share my location"}
        >
          <Navigation aria-hidden="true" />
          <span className={styles.controlLabel}>
            {broadcast.status === "requesting"
              ? "…"
              : broadcast.status === "denied"
                ? "Blocked"
                : broadcast.status === "unsupported"
                  ? "No GPS"
                  : sharing
                    ? "Sharing"
                    : "Share"}
          </span>
        </button>
      </div>

      {/* --- riders bottom sheet ---------------------------------------------------- */}
      {sheetOpen && (
        <button
          type="button"
          className={styles.sheetBackdrop}
          aria-label="Close riders"
          onClick={() => setSheetOpen(false)}
        />
      )}
      <div
        className={styles.sheet}
        data-open={sheetOpen || undefined}
        data-dragging={dragDy > 0 || undefined}
        role="dialog"
        aria-label="Riders"
        aria-hidden={!sheetOpen}
        style={sheetOpen && dragDy > 0 ? { transform: `translateY(${dragDy}px)` } : undefined}
      >
        <div
          className={styles.sheetGrab}
          onPointerDown={onGrabStart}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabEnd}
          onPointerCancel={onGrabEnd}
        >
          <span className={styles.sheetHandle} aria-hidden="true" />
        </div>

        <div className={styles.sheetHeader}>
          <div className={styles.sheetTabs}>
            <button
              type="button"
              className={sheetTab === "riders" ? styles.sheetTabActive : styles.sheetTab}
              onClick={() => setSheetTab("riders")}
            >
              Riders {roster ? `(${roster.length})` : ""}
            </button>
            <button
              type="button"
              className={sheetTab === "groups" ? styles.sheetTabActive : styles.sheetTab}
              onClick={() => setSheetTab("groups")}
            >
              Groups ({groups.length})
            </button>
          </div>
          <button
            type="button"
            className={styles.sheetClose}
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
          >
            <X width={18} height={18} aria-hidden="true" />
          </button>
        </div>

        {sheetTab === "riders" ? (
          <div className={styles.sheetBody}>
            {isOwner && (
              <div className={styles.sheetActions}>
                <label className={styles.showOthersToggle}>
                  <input
                    type="checkbox"
                    checked={showOthers}
                    onChange={(e) => setShowOthers(e.target.checked)}
                  />
                  Show others on map
                </label>
                {roster && roster.length > 0 && (
                  <button type="button" className={styles.linkBtn} onClick={selectAllRiders}>
                    Select all
                  </button>
                )}
                {selectedRiderIds.length > 0 && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setSelectedRiderIds([])}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {rosterNote && !roster && <p className="muted">{rosterNote}</p>}
            {roster && roster.length === 0 && <p className="muted">No one has joined yet.</p>}

            {orderedRoster && (
              <div className={styles.riderList}>
                {orderedRoster.map((r) => {
                  const live = ridersById.get(r.id);
                  const selected = selectedSet.has(r.id);
                  const disabled = !selected && capReached;
                  const isMe = event.myParticipant?.id === r.id;
                  const isLeader =
                    leaderDistance > 0 && (live?.distanceKm ?? -1) === leaderDistance;
                  const speed = riderSpeeds.get(r.id);
                  const gapKm =
                    !isLeader && live?.distanceKm != null && leaderDistance > 0
                      ? leaderDistance - live.distanceKm
                      : null;
                  const distanceFromMe =
                    selfPosition && live?.lat != null && live.lng != null
                      ? haversineDistanceKm(selfPosition, [live.lat, live.lng])
                      : null;
                  // A non-owner gets a read-only roster: no checkbox, no tracking. The row is a
                  // plain <div> for them, a <label> wrapping the select checkbox for the owner.
                  const RowTag = isOwner ? "label" : "div";
                  return (
                    <RowTag
                      key={r.id}
                      className={styles.riderRow}
                      data-selected={selected || undefined}
                      data-disabled={disabled || undefined}
                    >
                      {isOwner && (
                        <span className={styles.riderCheckbox} data-checked={selected}>
                          {selected && <Check width={13} height={13} aria-hidden="true" />}
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleRider(r.id)}
                          />
                        </span>
                      )}
                      <span
                        className={styles.riderDot}
                        style={{ background: placeholderColorVar(String(r.id)) }}
                        aria-hidden="true"
                      />
                      <Avatar
                        className={styles.riderAvatar}
                        name={r.name}
                        avatarUrl={r.avatarUrl}
                        identity={r.avatar}
                        seed={String(r.id)}
                      />
                      <span className={styles.riderInfo}>
                        <span className={styles.riderNameRow}>
                          <span className={styles.riderName}>
                            {r.name?.trim() || "Unnamed rider"}
                            {isMe && <span className="muted"> (ME)</span>}
                            {r.bib && <span className="muted"> #{r.bib}</span>}
                          </span>
                          {isLeader && <span className={styles.leaderBadge}>Leader</span>}
                        </span>
                        {(isOwner || live?.lat != null) && (
                          <span className={styles.riderSub}>
                            {live?.lat != null
                              ? `${speed != null ? `${speed.toFixed(1)} km/h` : "—"} · ${live.distanceKm?.toFixed(1) ?? "—"} km${live.recordedAt ? ` · ${formatAge(live.recordedAt)}` : ""}${distanceFromMe != null ? ` · ${distanceFromMe.toFixed(1)} km from you` : ""}`
                              : selected
                                ? "waiting for a fix…"
                                : "tap to track"}
                          </span>
                        )}
                      </span>
                      {live?.distanceKm != null && (
                        <span className={styles.riderStats}>
                          <span className={styles.riderSpeedValue}>
                            {speed != null ? speed.toFixed(1) : "—"}
                            <span className={styles.riderStatsUnit}> km/h</span>
                          </span>
                          <span className={styles.riderGapValue}>
                            {live.distanceKm.toFixed(1)} km
                            {gapKm != null && gapKm > 0 && (
                              <span className={styles.riderGap}> +{gapKm.toFixed(1)} km</span>
                            )}
                          </span>
                        </span>
                      )}
                    </RowTag>
                  );
                })}
              </div>
            )}

            {/* Dropped once the ride is over, same as the event page's share icon: the code
                behind the link stops resolving when the server clears is_active, so sharing a
                finished ride only hands out a dead invitation. This screen outlives the ride
                itself — it stays open showing final positions — so the guard is needed here
                too, not just on a page you arrive at afterwards. */}
            {!eventIsFinished && (
              <button
                type="button"
                className={styles.shareEventRow}
                onClick={() => setShareOpen(true)}
              >
                <Share2 width={16} height={16} aria-hidden="true" />
                Share this event
              </button>
            )}
          </div>
        ) : (
          <div className={styles.sheetBody}>
            {groups.length === 0 ? (
              <p className="muted">No ride groups set up for this event.</p>
            ) : (
              <div className={styles.riderList}>
                {groups.map((g) => (
                  <div key={g.id} className={styles.groupRow}>
                    <span className={styles.groupIcon} aria-hidden="true">
                      <UsersRound width={16} height={16} />
                    </span>
                    <span className={styles.riderInfo}>
                      <span className={styles.riderName}>{g.name}</span>
                      {g.startsAt && (
                        <span className={styles.riderSub}>
                          Starts{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(g.startsAt))}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {shareOpen && (
        <Suspense fallback={null}>
          <ShareEventSheet
            eventName={event.name}
            eventCode={event.code}
            startsAt={event.startsAt}
            location={event.location}
            onClose={() => setShareOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
