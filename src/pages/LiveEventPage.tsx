/**
 * The live map — a fully separate page from EventDetailPage, reached only via its "LIVE"
 * button (owner) or "Open live map" link (everyone else), never embedded inline. Going back is
 * the mirror image: a persistent "back to event" control here for every viewer, plus a
 * separate "Manage" link for the owner straight into the restricted participants view
 * (EventParticipantsPage.tsx) — asked for directly, twice, after an earlier pass got this
 * wrong by keeping a map on both pages.
 *
 * Route:  /events/live/:eventId
 * Loads:  GET /events/:eventId (name, isOwner, isPaused, startsAt, myParticipant, route via
 *         resultsStore — same call EventDetailPage.tsx makes), GET
 *         /events/:eventId/participants (rider names for the Riders tab below — best-effort: a
 *         viewer who isn't permitted to see the roster, per show_participants, still gets the
 *         map, just no name list to pick from), then polls GET /events/:eventId/live on
 *         config.livePollIntervalMs.
 *
 * Redesigned to match a reference screenshot supplied directly: a real header row (back/LIVE
 * pill/name/rider count/share), the map with an elapsed-time badge and on-map controls, a
 * stats strip (distance/elevation/remaining/avg speed/weather), and Riders/Groups tabs below
 * instead of a bottom-sheet drawer. The previous version is kept at
 * src/_backup-cockpit-design/LiveEventPage.tsx.bak.
 *
 * Per-rider speed and "remaining"/"avg speed" are derived client-side from real consecutive
 * position fixes (distanceKm delta / time delta) — the server has no speed field
 * (lib/live-types.ts) — same "compute it from real data, never invent it" rule the "distance
 * from you" figure already followed. The screenshot's Chat and Alerts bottom-bar buttons are
 * NOT included: neither feature exists anywhere in this codebase (no chat/notification system,
 * client or server), and this app doesn't ship non-functional buttons — see AGENT.md. "Ride
 * info" is real: it links to EventDetailPage.tsx.
 */

import {
  ArrowLeft,
  Check,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  MoreHorizontal,
  Radio,
  Search,
  Settings,
  Share2,
  UsersRound,
  X
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { placeholderColorVar } from "../app/event-visuals";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";
import { haversineDistanceKm } from "../lib/geo";
import type { LiveRider } from "../lib/live-types";
import { type EventSummary, getCachedEvent } from "../lib/local-db";
import { formatAge } from "../lib/time";
import { type DayForecast, getForecastForDate } from "../lib/weather";
import {
  type EventGroup,
  useEventGroupsStore
} from "../store/eventGroupsStore";
import { useResultsStore } from "../store/resultsStore";
import styles from "./LiveEventPage.module.css";

// Same lazy-Leaflet convention as RouteMap.tsx/LiveTracking.tsx used to — a page that never
// goes live still shouldn't pull the map library into its bundle.
const LiveRidersMap = lazy(() => import("../app/LiveRidersMap"));

const MAX_RIDERS_FOR_NON_OWNER = 5;

// A stable reference (not `[]` inline in the selector) — a fresh array on every call makes
// useSyncExternalStore see a "changed" snapshot on every render and spin into "Maximum update
// depth exceeded".
const EMPTY_GROUPS: EventGroup[] = [];

interface LiveEventInfo {
  id: string;
  name: string;
  isOwner: boolean;
  isPaused: boolean;
  showLiveLocations: boolean;
  startsAt: string | null;
  myParticipant: { id: number } | null;
}

// Same "paint the cache instantly, let the real fetch replace it" pattern as
// EventDetailPage.tsx's detailFromCachedSummary — a list-cached EventSummary has no isPaused/
// showLiveLocations/myParticipant, so those get honest defaults until the real fetch resolves.
function liveInfoFromCachedSummary(
  summary: EventSummary,
  viewerId: number | null
): LiveEventInfo {
  return {
    id: summary.id,
    name: summary.name,
    isOwner: viewerId != null && viewerId === summary.ownerId,
    isPaused: false,
    showLiveLocations: true,
    startsAt: summary.startsAt,
    myParticipant: null
  };
}

interface RosterEntry {
  id: number;
  // Nullable in practice (e.g. a participant row with no display name set yet) — the "go
  // live" crash was placeholderColorVar/initialOf assuming a string here. Guarded there too,
  // but keep the type honest.
  name: string | null;
  /** Real account's Google profile photo, or null for a manual/account-less rider. */
  avatarUrl: string | null;
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
  const [event, setEvent] = useState<LiveEventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const results = useResultsStore((s) => s.results);
  const loadResults = useResultsStore((s) => s.loadResults);
  const groups = useEventGroupsStore((s) =>
    eventId && s.byEvent[eventId] ? s.byEvent[eventId] : EMPTY_GROUPS
  );

  const [riders, setRiders] = useState<LiveRider[]>([]);
  const [paused, setPaused] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const [selectedRiderIds, setSelectedRiderIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<"riders" | "groups">("riders");
  const [ridersModalOpen, setRidersModalOpen] = useState(false);

  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterNote, setRosterNote] = useState<string | null>(null);

  const [sharingLocation, setSharingLocation] = useState(false);
  const [selfPosition, setSelfPosition] = useState<[number, number] | null>(
    null
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [forecast, setForecast] = useState<DayForecast | null>(null);

  // Per-rider speed, derived from consecutive real fixes (distance delta / time delta) — the
  // server has no speed field (lib/live-types.ts's doc comment). A ref (not state) holds the
  // previous fix so the poll loop below can diff against it without a stale closure.
  const prevFixRef = useRef<Map<number, { distanceKm: number; at: number }>>(
    new Map()
  );
  const [riderSpeeds, setRiderSpeeds] = useState<Map<number, number>>(
    new Map()
  );

  // Ticks once a second while this page is open, purely to keep the elapsed-time badge live —
  // never sent anywhere, never affects any other state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (eventId) loadResults(eventId);
  }, [eventId, loadResults]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    async function load() {
      if (!eventId) return;
      setLoading(true);
      setError(null);

      const cached = await getCachedEvent(eventId);
      if (cached && !cancelled) {
        const asLiveInfo = liveInfoFromCachedSummary(
          cached,
          profile?.id ?? null
        );
        setEvent(asLiveInfo);
        setPaused(asLiveInfo.isPaused);
        // Paint the cached summary now; the real fetch below still runs and replaces it.
        setLoading(false);
      }

      try {
        const found = await apiRequest<LiveEventInfo>(`/events/${eventId}`);
        if (cancelled) return;
        setEvent(found);
        setPaused(found.isPaused);
      } catch (err) {
        if (cancelled) return;
        // A cached summary is still on screen — a failed refresh shouldn't blank it out.
        if (cached) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "This event is private."
            : err instanceof ApiError && err.status === 404
              ? "Event not found."
              : "Could not load this event."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, profile?.id]);

  // The route's own start point stands in for "where this event is" — same forecast source
  // EventDetailPage.tsx uses. Silently shows nothing outside Open-Meteo's range or on failure.
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

  // Best-effort — a viewer who can't see the roster (private list, or not a registered rider
  // yet) still gets the map itself; they just have no names to pick from below.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    apiRequest<RosterEntry[]>(`/events/${eventId}/participants`)
      .then((list) => {
        if (!cancelled) setRoster(list);
      })
      .catch(() => {
        if (!cancelled)
          setRosterNote("The rider list isn't open for this event.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const isOwner = event?.isOwner ?? false;

  useEffect(() => {
    if (!eventId || !event) return;
    let cancelled = false;

    async function poll() {
      if (!isOwner && selectedRiderIds.length === 0) {
        if (!cancelled) setRiders([]);
        return;
      }
      const query = isOwner ? "" : `?riders=${selectedRiderIds.join(",")}`;
      try {
        const found = await apiRequest<{
          riders: LiveRider[];
          paused: boolean;
        }>(`/events/${eventId}/live${query}`);
        if (cancelled) return;
        setRiders(found.riders);
        setPaused(found.paused);

        // Diff each rider's new fix against its previous one to derive a speed — only when
        // both a distance and a strictly-later timestamp are present. A functional update
        // (not a value closed over from render) so this never needs riderSpeeds in the
        // effect's own dependency array.
        setRiderSpeeds((prevSpeeds) => {
          const nextSpeeds = new Map(prevSpeeds);
          for (const r of found.riders) {
            if (r.distanceKm == null || r.recordedAt == null) continue;
            const at = new Date(r.recordedAt).getTime();
            const prev = prevFixRef.current.get(r.participantId);
            if (prev && at > prev.at) {
              const dtHours = (at - prev.at) / 3_600_000;
              const dKm = r.distanceKm - prev.distanceKm;
              if (dtHours > 0 && dKm >= 0) {
                nextSpeeds.set(r.participantId, dKm / dtHours);
              }
            }
            prevFixRef.current.set(r.participantId, {
              distanceKm: r.distanceKm,
              at
            });
          }
          return nextSpeeds;
        });
      } catch {
        // A transient poll failure keeps showing the last known positions rather than
        // blanking the map out every time a rider goes through a dead zone.
      }
    }

    void poll();
    const id = window.setInterval(poll, config.livePollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, event, isOwner, selectedRiderIds]);

  // "Share my location" — opt-in only, so opening the live page never triggers a surprise
  // permission prompt. Never transmitted anywhere (AGENT.md: "This app displays positions; it
  // never sends them"); real rider tracking is the separate Android app.
  useEffect(() => {
    if (!sharingLocation) {
      setSelfPosition(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoError("This device does not support location sharing.");
      setSharingLocation(false);
      return;
    }
    setGeoError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => setSelfPosition([pos.coords.latitude, pos.coords.longitude]),
      () => {
        setGeoError("Location permission was denied.");
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
    };
  }, [sharingLocation]);

  function toggleRider(id: number) {
    setSelectedRiderIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (!isOwner && ids.length >= MAX_RIDERS_FOR_NON_OWNER) return ids;
      return [...ids, id];
    });
  }

  // Non-owners are still capped at MAX_RIDERS_FOR_NON_OWNER — same limit each individual
  // checkbox already enforces, just applied to the whole roster at once.
  function selectAllRiders() {
    if (!roster) return;
    const ids = roster.map((r) => r.id);
    setSelectedRiderIds(isOwner ? ids : ids.slice(0, MAX_RIDERS_FOR_NON_OWNER));
  }

  const selectedSet = useMemo(
    () => new Set(selectedRiderIds),
    [selectedRiderIds]
  );
  const ridersById = useMemo(
    () => new Map(riders.map((r) => [r.participantId, r])),
    [riders]
  );
  const capReached =
    !isOwner && selectedRiderIds.length >= MAX_RIDERS_FOR_NON_OWNER;
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

  // Leader = whoever has gone furthest right now, among riders this device can actually see —
  // the same figure "remaining"/"avg speed" below are built from. Never a fabricated ranking.
  const leaderDistance = riders.reduce(
    (max, r) => Math.max(max, r.distanceKm ?? 0),
    0
  );
  const myDistance = event?.myParticipant
    ? (ridersById.get(event.myParticipant.id)?.distanceKm ?? null)
    : null;
  const progressKm = myDistance ?? (leaderDistance > 0 ? leaderDistance : null);
  const elapsedMs = event?.startsAt
    ? Math.max(0, now - new Date(event.startsAt).getTime())
    : null;
  const avgSpeedKmh =
    progressKm != null && elapsedMs != null && elapsedMs > 0
      ? progressKm / (elapsedMs / 3_600_000)
      : null;
  const remainingKm =
    results?.route?.distanceKm != null && progressKm != null
      ? Math.max(0, results.route.distanceKm - progressKm)
      : null;

  if (loading) {
    return (
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading live map…</span>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="stack">
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

  return (
    <div className={styles.wrap}>
      {/* --- header ------------------------------------------------------------------- */}
      <div className={styles.header}>
        <Link
          to={`/events/${event.id}`}
          className={styles.backBtn}
          aria-label="Back to event"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={styles.headerText}>
          <div className={styles.headerTopRow}>
            <span className={styles.livePill} data-paused={paused || undefined}>
              {paused ? "Paused" : "Live"}
            </span>
            <h1 className={styles.headerTitle}>{event.name}</h1>
          </div>
          <p className={styles.headerSub}>
            {roster ? roster.length : "—"} riders
          </p>
        </div>
        <button
          type="button"
          className={styles.headerIconBtn}
          aria-label="Share this event"
        >
          <Share2 aria-hidden="true" />
        </button>
        {isOwner && (
          <Link
            to={`/events/${event.id}/participants`}
            className={styles.headerIconBtn}
            aria-label="Manage event"
            title="Manage"
          >
            <Settings aria-hidden="true" />
          </Link>
        )}
        {!isOwner && (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label="More"
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      </div>

      {/* --- map ------------------------------------------------------------------------ */}
      <div className={styles.mapArea}>
        <Suspense fallback={<div className="row muted">Loading the map…</div>}>
          <LiveRidersMap
            riders={riders}
            routePoints={results?.route?.points ?? []}
            selfPosition={selfPosition}
            showOthers={showOthers}
            selectedRiderIds={selectedRiderIds}
            onToggleRider={toggleRider}
          />
        </Suspense>

        {elapsedMs != null && (
          <div className={styles.elapsedBadge}>
            <div className={styles.elapsedTime}>{formatElapsed(elapsedMs)}</div>
            <div className={styles.elapsedLabel}>Elapsed Time</div>
          </div>
        )}

        {results?.route?.elevationM != null && (
          <div className={styles.elevationBadge}>
            <Layers width={13} height={13} aria-hidden="true" />
            {results.route.elevationM} m
          </div>
        )}

        {paused && (
          <div className={styles.pausedBanner} role="status">
            <Radio width={14} height={14} aria-hidden="true" />
            Paused by organizer
          </div>
        )}

        {/* On-map utility stack — visual only (compass/layers aren't wired to anything real
            yet); "locate" re-centers on this device's own shared position, when there is one. */}
        <div className={styles.mapControls}>
          <button
            type="button"
            className={styles.mapControlBtn}
            aria-label="North"
            disabled
          >
            <Compass width={16} height={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.mapControlBtn}
            onClick={() => setRidersModalOpen((v) => !v)}
            aria-pressed={ridersModalOpen}
            aria-label={ridersModalOpen ? "Hide rider picker" : "Select riders"}
            title={ridersModalOpen ? "Hide rider picker" : "Select riders"}
            data-active={ridersModalOpen || undefined}
          >
            <UsersRound width={16} height={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.mapControlBtn}
            onClick={() => setShowOthers((v) => !v)}
            aria-pressed={showOthers}
            aria-label={showOthers ? "Hide other riders" : "Show other riders"}
            title={showOthers ? "Hide other riders" : "Show other riders"}
          >
            {showOthers ? (
              <Eye width={16} height={16} aria-hidden="true" />
            ) : (
              <EyeOff width={16} height={16} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.mapControlBtn}
            onClick={() => setSharingLocation((v) => !v)}
            aria-pressed={sharingLocation}
            aria-label={
              sharingLocation ? "Sharing my location" : "Share my location"
            }
            title={
              sharingLocation ? "Sharing my location" : "Share my location"
            }
            data-active={sharingLocation || undefined}
          >
            <Crosshair width={16} height={16} aria-hidden="true" />
          </button>
        </div>

        {/* Quick rider picker — a left-anchored overlay (not a full-width panel below the map,
            like the Riders tab further down) so checking a rider shows them appear on the same
            map, still visible on the right, without scrolling away from it. */}
        <div
          className={styles.ridersModal}
          data-open={ridersModalOpen || undefined}
          role="dialog"
          aria-label="Select riders to track"
          aria-hidden={!ridersModalOpen}
        >
          <div className={styles.ridersModalHeader}>
            <h2 className={styles.ridersModalTitle}>
              Riders {roster ? `(${roster.length})` : ""}
            </h2>
            <div className={styles.ridersModalActions}>
              {roster && roster.length > 0 && (
                <button
                  type="button"
                  className={styles.ridersModalUncheckAll}
                  onClick={selectAllRiders}
                >
                  Select all
                </button>
              )}
              {selectedRiderIds.length > 0 && (
                <button
                  type="button"
                  className={styles.ridersModalUncheckAll}
                  onClick={() => setSelectedRiderIds([])}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className={styles.ridersModalClose}
                onClick={() => setRidersModalOpen(false)}
                aria-label="Close"
              >
                <X width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={styles.ridersModalList}>
            {rosterNote && !roster && (
              <p className={styles.ridersModalNote}>{rosterNote}</p>
            )}
            {roster && roster.length === 0 && (
              <p className={styles.ridersModalNote}>No one has joined yet.</p>
            )}
            {orderedRoster &&
              orderedRoster.map((r) => {
                const selected = selectedSet.has(r.id);
                const disabled = !selected && capReached;
                const isMe = event.myParticipant?.id === r.id;
                return (
                  <label
                    key={r.id}
                    className={styles.ridersModalRow}
                    data-selected={selected || undefined}
                    data-disabled={disabled || undefined}
                  >
                    <span
                      className={styles.riderCheckbox}
                      data-checked={selected}
                    >
                      {selected && (
                        <Check width={13} height={13} aria-hidden="true" />
                      )}
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleRider(r.id)}
                      />
                    </span>
                    <Avatar
                      className={styles.riderAvatar}
                      name={r.name}
                      avatarUrl={r.avatarUrl}
                      seed={String(r.id)}
                    />
                    <span className={styles.ridersModalName}>
                      {r.name?.trim() || "Unnamed rider"}
                      {isMe && <span className="muted"> (ME)</span>}
                      {r.bib && <span className="muted"> #{r.bib}</span>}
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      </div>

      {geoError && (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {geoError}
        </p>
      )}

      {/* --- stats strip ------------------------------------------------------------- */}
      <div className={styles.statsRow}>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Distance</span>
          <span className={styles.statValue}>
            {results?.route?.distanceKm != null
              ? `${results.route.distanceKm} km`
              : "—"}
          </span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Elevation</span>
          <span className={styles.statValue}>
            {results?.route?.elevationM != null
              ? `${results.route.elevationM} m`
              : "—"}
          </span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Remaining</span>
          <span className={styles.statValue}>
            {remainingKm != null ? `${remainingKm.toFixed(0)} km` : "—"}
          </span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Avg speed</span>
          <span className={styles.statValue}>
            {avgSpeedKmh != null ? `${avgSpeedKmh.toFixed(1)} km/h` : "—"}
          </span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statLabel}>Weather</span>
          <span className={styles.statValue}>
            {forecast
              ? `${Math.round((forecast.tempMinC + forecast.tempMaxC) / 2)}°`
              : "—"}
            {forecast && (
              <span aria-hidden="true" style={{ marginLeft: 4 }}>
                {forecast.emoji}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* --- Riders / Groups tabs ------------------------------------------------------ */}
      <div className={styles.tabsRow}>
        <button
          type="button"
          className={activeTab === "riders" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("riders")}
        >
          Riders {roster ? `(${roster.length})` : ""}
        </button>
        <button
          type="button"
          className={activeTab === "groups" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("groups")}
        >
          Groups ({groups.length})
        </button>
        <button
          type="button"
          className={styles.tabIconBtn}
          aria-label="Search riders"
          disabled
        >
          <Search width={16} height={16} aria-hidden="true" />
        </button>
      </div>

      {activeTab === "riders" ? (
        <div className={styles.panelBody}>
          {rosterNote && !roster && <p className="muted">{rosterNote}</p>}
          {roster && roster.length === 0 && (
            <p className="muted">No one has joined yet.</p>
          )}
          {orderedRoster && (
            <div className={styles.riderList}>
              {orderedRoster.map((r) => {
                const live = ridersById.get(r.id);
                const selected = selectedSet.has(r.id);
                const disabled = !selected && capReached;
                const isMe = event.myParticipant?.id === r.id;
                const isLeader =
                  leaderDistance > 0 &&
                  (live?.distanceKm ?? -1) === leaderDistance;
                const speed = riderSpeeds.get(r.id);
                const gapKm =
                  !isLeader && live?.distanceKm != null && leaderDistance > 0
                    ? leaderDistance - live.distanceKm
                    : null;
                const distanceFromMe =
                  selfPosition && live?.lat != null && live.lng != null
                    ? haversineDistanceKm(selfPosition, [live.lat, live.lng])
                    : null;
                return (
                  <label
                    key={r.id}
                    className={styles.riderRow}
                    data-selected={selected || undefined}
                    data-disabled={disabled || undefined}
                  >
                    <span
                      className={styles.riderCheckbox}
                      data-checked={selected}
                    >
                      {selected && (
                        <Check width={13} height={13} aria-hidden="true" />
                      )}
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleRider(r.id)}
                      />
                    </span>
                    <span
                      className={styles.riderDot}
                      style={{ background: placeholderColorVar(String(r.id)) }}
                      aria-hidden="true"
                    />
                    <Avatar
                      className={styles.riderAvatar}
                      name={r.name}
                      avatarUrl={r.avatarUrl}
                      seed={String(r.id)}
                    />
                    <span className={styles.riderInfo}>
                      <span className={styles.riderNameRow}>
                        <span className={styles.riderName}>
                          {r.name?.trim() || "Unnamed rider"}
                          {isMe && <span className="muted"> (ME)</span>}
                          {r.bib && <span className="muted"> #{r.bib}</span>}
                        </span>
                        {isLeader && (
                          <span className={styles.leaderBadge}>Leader</span>
                        )}
                      </span>
                      <span className={styles.riderSub}>
                        {live?.lat != null
                          ? `${speed != null ? `${speed.toFixed(1)} km/h` : "—"} · ${live.distanceKm?.toFixed(1) ?? "—"} km${live.recordedAt ? ` · ${formatAge(live.recordedAt)}` : ""}${distanceFromMe != null ? ` · ${distanceFromMe.toFixed(1)} km from you` : ""}`
                          : selected
                            ? "waiting for a fix…"
                            : "tap to track"}
                      </span>
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
                            <span className={styles.riderGap}>
                              {" "}
                              +{gapKm.toFixed(1)} km
                            </span>
                          )}
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.panelBody}>
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
                          minute: "2-digit"
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

      {/* --- bottom bar --------------------------------------------------------------
          Only "Ride info" is real (links to EventDetailPage.tsx) — Chat/Alerts from the
          reference screenshot aren't included; neither feature exists anywhere in this
          codebase yet (see the doc comment at the top of this file). */}
      <Link to={`/events/${event.id}`} className={styles.rideInfoBtn}>
        Ride info
      </Link>
    </div>
  );
}
