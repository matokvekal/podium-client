/**
 * The live map — a fully separate page from EventDetailPage, reached only via its "LIVE"
 * button (owner) or "Open live map" link (everyone else), never embedded inline. Going back is
 * the mirror image: a persistent "back to event" control here for every viewer, plus a
 * separate "Manage" link for the owner straight into the restricted participants view
 * (EventParticipantsPage.tsx) — asked for directly, twice, after an earlier pass got this
 * wrong by keeping a map on both pages.
 *
 * Route:  /events/:eventId/live
 * Loads:  GET /events/:eventId (name, isOwner, isPaused, route via resultsStore — same call
 *         EventDetailPage.tsx makes), GET /events/:eventId/participants (rider names for the
 *         drawer below — best-effort: a viewer who isn't permitted to see the roster, per
 *         show_participants, still gets the map, just no name list to pick from), then polls
 *         GET /events/:eventId/live on config.livePollIntervalMs.
 *
 * Map-first, minimal chrome — asked for directly ("rider at bike no have time for many
 * details"): the default view is the map alone, self position + other riders, no panel open.
 * Everything else (rider list, checkboxes, distance numbers) lives in a bottom sheet that's
 * closed until one tap on the floating "Riders" button. On-map controls are few, large,
 * thumb-reachable round buttons, not small text links.
 */

import { ChevronUp, Eye, EyeOff, Radio, Settings, Users, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";
import { haversineDistanceKm } from "../lib/geo";
import type { LiveRider } from "../lib/live-types";
import { formatAge } from "../lib/time";
import { useResultsStore } from "../store/resultsStore";
import styles from "./LiveEventPage.module.css";

// Same lazy-Leaflet convention as RouteMap.tsx/LiveTracking.tsx used to — a page that never
// goes live still shouldn't pull the map library into its bundle.
const LiveRidersMap = lazy(() => import("../app/LiveRidersMap"));

const MAX_RIDERS_FOR_NON_OWNER = 5;

interface LiveEventInfo {
  id: string;
  name: string;
  isOwner: boolean;
  isPaused: boolean;
  showLiveLocations: boolean;
}

interface RosterEntry {
  id: number;
  name: string;
  bib: string | null;
}

export function LiveEventPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<LiveEventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const results = useResultsStore((s) => s.results);
  const loadResults = useResultsStore((s) => s.loadResults);

  const [riders, setRiders] = useState<LiveRider[]>([]);
  const [paused, setPaused] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const [selectedRiderIds, setSelectedRiderIds] = useState<number[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterNote, setRosterNote] = useState<string | null>(null);

  const [sharingLocation, setSharingLocation] = useState(false);
  const [selfPosition, setSelfPosition] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (eventId) loadResults(eventId);
  }, [eventId, loadResults]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    apiRequest<LiveEventInfo>(`/events/${eventId}`)
      .then((found) => {
        if (cancelled) return;
        setEvent(found);
        setPaused(found.isPaused);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "This event is private."
            : err instanceof ApiError && err.status === 404
              ? "Event not found."
              : "Could not load this event.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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
        if (!cancelled) setRosterNote("The rider list isn't open for this event.");
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
        const found = await apiRequest<{ riders: LiveRider[]; paused: boolean }>(
          `/events/${eventId}/live${query}`,
        );
        if (cancelled) return;
        setRiders(found.riders);
        setPaused(found.paused);
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
      { enableHighAccuracy: true, maximumAge: 10_000 },
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

  const selectedSet = useMemo(() => new Set(selectedRiderIds), [selectedRiderIds]);
  const ridersById = useMemo(() => new Map(riders.map((r) => [r.participantId, r])), [riders]);
  const capReached = !isOwner && selectedRiderIds.length >= MAX_RIDERS_FOR_NON_OWNER;

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
      <div className={styles.mapArea}>
        <Suspense fallback={<div className="row muted">Loading the map…</div>}>
          <LiveRidersMap
            riders={riders}
            routePoints={results?.route.points ?? []}
            selfPosition={selfPosition}
            showOthers={showOthers}
            selectedRiderIds={selectedRiderIds}
            onToggleRider={toggleRider}
          />
        </Suspense>

        <Link
          to={`/events/${event.id}`}
          className={styles.backBtn}
          aria-label="Back to event"
          title="Back to event"
        >
          ‹
        </Link>

        {isOwner && (
          <Link
            to={`/events/${event.id}/participants`}
            className={styles.manageBtn}
            aria-label="Manage event"
            title="Manage"
          >
            <Settings width={20} height={20} aria-hidden="true" />
          </Link>
        )}

        {paused && (
          <div className={styles.pausedBanner} role="status">
            <Radio width={14} height={14} aria-hidden="true" />
            Paused by organizer
          </div>
        )}

        <button
          type="button"
          className={styles.othersBtn}
          onClick={() => setShowOthers((v) => !v)}
          aria-pressed={showOthers}
          aria-label={showOthers ? "Hide other riders" : "Show other riders"}
          title={showOthers ? "Hide other riders" : "Show other riders"}
        >
          {showOthers ? (
            <Eye width={20} height={20} aria-hidden="true" />
          ) : (
            <EyeOff width={20} height={20} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className={styles.shareLocationBtn}
          onClick={() => setSharingLocation((v) => !v)}
          aria-pressed={sharingLocation}
          aria-label={sharingLocation ? "Sharing my location" : "Share my location"}
          title={sharingLocation ? "Sharing my location" : "Share my location"}
        >
          <Radio width={20} height={20} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles.ridersBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label="Show riders"
          title="Riders"
        >
          <Users width={22} height={22} aria-hidden="true" />
          {selectedRiderIds.length > 0 && (
            <span className={styles.ridersBadge}>{selectedRiderIds.length}</span>
          )}
        </button>
      </div>

      {geoError && (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {geoError}
        </p>
      )}

      {drawerOpen && (
        <>
          <div
            className={styles.drawerOverlay}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className={styles.drawer} role="dialog" aria-label="Riders">
            <button
              type="button"
              className={styles.drawerHandle}
              onClick={() => setDrawerOpen(false)}
              aria-label="Close riders panel"
            >
              <ChevronUp width={16} height={16} aria-hidden="true" />
            </button>
            <div className={styles.drawerHeader}>
              <span>Riders{!isOwner && ` (up to ${MAX_RIDERS_FOR_NON_OWNER})`}</span>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <X width={18} height={18} aria-hidden="true" />
              </button>
            </div>

            {rosterNote && !roster && <p className="muted">{rosterNote}</p>}

            {roster && roster.length === 0 && <p className="muted">No one has joined yet.</p>}

            {roster && (
              <div className={styles.riderList}>
                {roster.map((r) => {
                  const live = ridersById.get(r.id);
                  const selected = selectedSet.has(r.id);
                  const disabled = !selected && capReached;
                  const distanceFromMe =
                    selfPosition && live?.lat != null && live.lng != null
                      ? haversineDistanceKm(selfPosition, [live.lat, live.lng])
                      : null;
                  return (
                    <label
                      key={r.id}
                      className={
                        selected ? `${styles.riderRow} ${styles.riderRowSelected}` : styles.riderRow
                      }
                      data-disabled={disabled || undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleRider(r.id)}
                      />
                      <span className={styles.riderName}>
                        {r.name}
                        {r.bib && <span className="muted"> #{r.bib}</span>}
                      </span>
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {live?.lat != null
                          ? `${live.distanceKm?.toFixed(1) ?? "—"} km · ${live.recordedAt ? formatAge(live.recordedAt) : "—"}${distanceFromMe != null ? ` · ${distanceFromMe.toFixed(1)} km from you` : ""}`
                          : selected
                            ? "waiting for a fix…"
                            : "tap to track"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
