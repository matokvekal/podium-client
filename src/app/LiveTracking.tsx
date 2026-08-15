/**
 * Live tracking panel on EventDetailPage, shown only while an event's status is `live` — the
 * same page every rider already sees, not a separate "launch" page: a rider gets a read-only
 * view, the organizer additionally gets the pinned Start/Finish-adjacent controls below.
 *
 * Calls the real `GET /events/:eventId/live` endpoint (plan/07-api-contract.md — listed under
 * "Part 2 — TO BUILD", not built server-side yet). Deliberately does NOT fall back to any
 * simulated rider positions if that call fails or returns nothing — a direct product
 * decision (confirmed directly, not assumed): unlike track/results/participant mock data,
 * which is illustrative and clearly not "happening right now," fake dots moving on a *live*
 * map would misrepresent GPS tracking as already working. That conflicts with this app's
 * standing rule against fabricating anything that reads as a live/safety signal — see
 * TrackCard.tsx / TrackMap.tsx's hazard-display doc comments for the same principle applied
 * elsewhere (only ever show a real "high" hazard report, never a fake "all clear").
 *
 * The map itself, the start/finish markers and the "0 riders" empty state are all real and
 * shown immediately once live — only the *other riders'* dots wait for real data. The one
 * exception is the viewer's own position (selfPosition below): genuinely real, from this
 * device's own Geolocation API, opt-in via "Share my location" so opening a live event never
 * triggers a surprise permission prompt. It is drawn locally only — never transmitted
 * anywhere (AGENT.md: "This app displays positions; it never sends them." Real rider tracking
 * needs the Android app; see RouteMap.tsx's doc comment).
 *
 * Written against the real response shape now so swapping this from "always empty" to
 * "actually live" needs no changes here — the day the endpoint exists, riders just show up.
 */

import { CheckCircle2, Navigation, Radio, XCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api-client";
import type { Participant } from "../lib/mock-participants";
import { formatLocalTime } from "../lib/time";
import { useParticipantsStore } from "../store/participantsStore";
import styles from "./LiveTracking.module.css";

const LiveRidersMap = lazy(() => import("./LiveRidersMap"));

// Stable reference for "no participants loaded for this event yet" — `s.byEvent[eventId] ?? []`
// allocates a brand-new array every render when the key is missing, which breaks Zustand's
// (useSyncExternalStore's) reference-equality snapshot check and causes an infinite render
// loop ("Maximum update depth exceeded" / "getSnapshot should be cached"). One shared empty
// array here means the fallback is referentially stable across renders.
const NO_PARTICIPANTS: Participant[] = [];

export interface LiveRider {
  participantId: number;
  name: string;
  bib: string | null;
  lat: number;
  lng: number;
  recordedAt: string;
  emergency: boolean;
  distanceKm: number;
}

interface LiveTrackingProps {
  eventId: string;
  isOwner: boolean;
  busy: boolean;
  onFinish: () => void;
  routePoints: [number, number][];
  wazeHref: string | null;
}

export function LiveTracking({
  eventId,
  isOwner,
  busy,
  onFinish,
  routePoints,
  wazeHref,
}: LiveTrackingProps) {
  const [riders, setRiders] = useState<LiveRider[] | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);

  const [sharingLocation, setSharingLocation] = useState(false);
  const [selfPosition, setSelfPosition] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const participants = useParticipantsStore((s) =>
    eventId ? (s.byEvent[eventId] ?? NO_PARTICIPANTS) : NO_PARTICIPANTS,
  );
  const setFinished = useParticipantsStore((s) => s.setFinished);

  useEffect(() => {
    let cancelled = false;
    apiRequest<LiveRider[]>(`/events/${eventId}/live`)
      .then((found) => {
        if (!cancelled) setRiders(found);
      })
      .catch(() => {
        // No real endpoint yet (or genuinely nobody transmitting) — either way, the honest
        // "0 riders" map below, never a guess at where riders might be.
        if (!cancelled) setRiders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // "Share my location" — opt-in only, per direct confirmation, so a live event never asks
  // for the location permission the moment it's opened. Stops the watch on toggle-off or
  // unmount; never fetch()s the position anywhere (see this file's own doc comment).
  useEffect(() => {
    if (!sharingLocation) return;
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

  useEffect(() => {
    if (!sharingLocation) setSelfPosition(null);
  }, [sharingLocation]);

  if (riders == null) {
    return (
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading live map…</span>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className={`row ${styles.actionBar}`} style={{ flexWrap: "wrap" }}>
        {wazeHref && (
          <a
            href={wazeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--quiet"
          >
            <Navigation width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
            Waze to start
          </a>
        )}
        <button
          type="button"
          className={sharingLocation ? "button" : "button button--quiet"}
          onClick={() => setSharingLocation((v) => !v)}
        >
          <Radio width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
          {sharingLocation ? "Sharing my location" : "Share my location"}
        </button>
        {isOwner && (
          <button type="button" className="button" disabled={busy} onClick={onFinish}>
            Finish ride
          </button>
        )}
      </div>
      {geoError && (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {geoError}
        </p>
      )}

      <Suspense fallback={<div className="row muted">Loading the map…</div>}>
        <LiveRidersMap
          riders={riders}
          routePoints={routePoints}
          selfPosition={selfPosition}
          selectedRiderId={selectedRiderId}
          onSelectRider={setSelectedRiderId}
        />
      </Suspense>

      {riders.length === 0 ? (
        <div className={`card stack ${styles.placeholder}`}>
          <Radio width={20} height={20} aria-hidden="true" className={styles.icon} />
          <p style={{ margin: 0 }}>No riders transmitting yet.</p>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Needs the Android tracking app — not built yet.
          </p>
        </div>
      ) : (
        <div className={styles.riderList}>
          {riders.map((rider) => {
            const matched = participants.find((p) => p.id === String(rider.participantId));
            const arrived = matched?.resultStatus === "finished";
            // Outer row is a plain, non-interactive container — a <button> can't contain
            // another <button>, so the row-select action and the arrived-toggle are two
            // sibling buttons rather than one nested inside the other.
            return (
              <div
                key={rider.participantId}
                className={
                  rider.participantId === selectedRiderId
                    ? `${styles.riderRow} ${styles.riderRowSelected}`
                    : styles.riderRow
                }
              >
                <button
                  type="button"
                  className={styles.riderRowMain}
                  onClick={() => setSelectedRiderId(rider.participantId)}
                >
                  <span className={styles.riderName}>
                    {rider.name}
                    {rider.bib && <span className="muted"> #{rider.bib}</span>}
                    {rider.emergency && <span className={styles.sosTag}>SOS</span>}
                  </span>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {rider.distanceKm} km · {formatLocalTime(rider.recordedAt)}
                  </span>
                </button>
                {isOwner && matched && (
                  <button
                    type="button"
                    className={arrived ? styles.arrivedBtnActive : styles.arrivedBtn}
                    title={arrived ? "Arrived — click to undo" : "Mark arrived"}
                    onClick={() => setFinished(eventId, matched.id, !arrived)}
                  >
                    {arrived ? (
                      <CheckCircle2 width={16} height={16} aria-hidden="true" />
                    ) : (
                      <XCircle width={16} height={16} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
