/**
 * The rider's own GPS → server, during a LIVE event they belong to. Reuses the frozen
 * POST /api/v1/events/:eventId/locations/batch endpoint (plan/07-api-contract.md) — the same
 * one the Android transmitter uses. Opt-in only: nothing runs until the rider taps "share my
 * location" on the live page.
 *
 * Guarantees, by construction:
 *   - exactly one navigator.geolocation.watchPosition watcher and one upload interval at a
 *     time (startWatcher() tears down any existing pair before creating a new one);
 *   - transmission only while shouldTransmitLocation() holds (permission + live + not finished
 *     + participant + not manually stopped — see lib/location-broadcast.ts);
 *   - a manual stop is remembered per event in sessionStorage, so a re-render / a return from
 *     background does NOT silently restart it;
 *   - on return to the foreground the watcher is recreated if it may have been killed while
 *     backgrounded, but only after re-checking that the event is still live;
 *   - teardown on manual stop, event finished, rider left, event switched, logout (unmount).
 *
 * The web client has no SOS UI, so every point is sent with emergency: false.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api-client";
import { config } from "../lib/config";
import {
  appendPoint,
  type GpsPoint,
  locationStoppedKey,
  MAX_BUFFERED_POINTS,
  shouldTransmitLocation,
} from "../lib/location-broadcast";

export type BroadcastStatus = "off" | "requesting" | "sharing" | "denied" | "unsupported";

interface Params {
  eventId: string | undefined;
  /** event.myParticipant?.id ?? null — null means "not a participant", which stops transmission. */
  participantId: number | null;
  eventIsLive: boolean;
  eventIsFinished: boolean;
}

interface Result {
  status: BroadcastStatus;
  /** User opt-in: request permission, then begin the watcher + upload loop. */
  start(): void;
  /** Manual stop: tear everything down and remember it for this event. */
  stop(): void;
  /** Latest fix, for the "you are here" marker on the map. */
  selfPosition: [number, number] | null;
}

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000 };

function isStopped(eventId: string): boolean {
  try {
    return window.sessionStorage.getItem(locationStoppedKey(eventId)) === "1";
  } catch {
    return false;
  }
}

function setStopped(eventId: string, stopped: boolean): void {
  try {
    if (stopped) window.sessionStorage.setItem(locationStoppedKey(eventId), "1");
    else window.sessionStorage.removeItem(locationStoppedKey(eventId));
  } catch {
    // Private mode / storage disabled — the in-memory `intent` flag still governs this session.
  }
}

export function useLocationBroadcast(params: Params): Result {
  const { eventId, participantId, eventIsLive, eventIsFinished } = params;

  const [status, setStatus] = useState<BroadcastStatus>("off");
  const [selfPosition, setSelfPosition] = useState<[number, number] | null>(null);

  // What the async geolocation / interval / visibility callbacks read to get *current* values
  // without being re-created (and without stale closures).
  const latest = useRef({ eventId, participantId, eventIsLive, eventIsFinished });
  latest.current = { eventId, participantId, eventIsLive, eventIsFinished };

  // The single watcher + single interval + outbound buffer. Never more than one of each.
  const runtime = useRef({
    watchId: null as number | null,
    intervalId: null as number | null,
    buffer: [] as GpsPoint[],
    permissionGranted: false,
    /** The rider wants to be sharing (tapped start, hasn't stopped). Survives re-renders. */
    intent: false,
    uploading: false,
    lastFixAt: 0,
  });

  const teardown = useCallback(() => {
    const r = runtime.current;
    if (r.watchId != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(r.watchId);
    }
    if (r.intervalId != null) window.clearInterval(r.intervalId);
    r.watchId = null;
    r.intervalId = null;
    r.uploading = false;
  }, []);

  const flush = useCallback(async () => {
    const r = runtime.current;
    const { eventId, participantId, eventIsLive, eventIsFinished } = latest.current;
    if (!eventId || participantId == null || r.uploading || r.buffer.length === 0) return;
    if (
      !shouldTransmitLocation({
        permissionGranted: r.permissionGranted,
        eventIsLive,
        eventIsFinished,
        userBelongsToEvent: participantId != null,
        manuallyStopped: !r.intent || isStopped(eventId),
      })
    ) {
      return;
    }
    // ≤ 200 per batch (endpoint hard limit). Anything past that stays queued for the next tick.
    const points = r.buffer.slice(0, MAX_BUFFERED_POINTS);
    r.uploading = true;
    try {
      await apiRequest(`/events/${eventId}/locations/batch`, {
        method: "POST",
        body: { participantId, points },
      });
      // Drop exactly what was sent; fixes that landed mid-request stay queued.
      r.buffer = r.buffer.slice(points.length);
    } catch {
      // Offline / server unreachable — keep the buffer (capped by appendPoint) and retry next tick.
    } finally {
      r.uploading = false;
    }
  }, []);

  const onFix = useCallback((pos: GeolocationPosition) => {
    const r = runtime.current;
    r.permissionGranted = true;
    r.lastFixAt = Date.now();
    setSelfPosition([pos.coords.latitude, pos.coords.longitude]);
    const accuracy = pos.coords.accuracy;
    r.buffer = appendPoint(r.buffer, {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ...(accuracy != null && Number.isFinite(accuracy) ? { accuracy } : {}),
      recordedAt: new Date(pos.timestamp).toISOString(),
      emergency: false,
    });
    setStatus("sharing");
  }, []);

  const onWatchError = useCallback(
    (err: GeolocationPositionError) => {
      // Permission revoked mid-session — stop, and do not re-prompt in a loop.
      if (err.code === err.PERMISSION_DENIED) {
        teardown();
        runtime.current.intent = false;
        runtime.current.permissionGranted = false;
        setStatus("denied");
        setSelfPosition(null);
      }
      // code 2 (position unavailable) / 3 (timeout): transient. The browser keeps the watch and
      // calls onFix once a fix returns — nothing to do here, and no re-prompt.
    },
    [teardown],
  );

  const startWatcher = useCallback(() => {
    teardown(); // guarantee exactly one watcher + one interval
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    const r = runtime.current;
    r.watchId = navigator.geolocation.watchPosition(onFix, onWatchError, GEO_OPTIONS);
    r.intervalId = window.setInterval(() => void flush(), config.locationBatchIntervalMs);
  }, [teardown, onFix, onWatchError, flush]);

  const start = useCallback(() => {
    const { eventId } = latest.current;
    if (!eventId) return;
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    const r = runtime.current;
    r.intent = true;
    setStopped(eventId, false);
    setStatus("requesting");

    const begin = () => {
      // One position probe: surfaces the OS prompt / confirms the grant, and its fix is also
      // the first buffered point. Then hand off to the continuous watcher.
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!runtime.current.intent) return; // stopped during the prompt
          onFix(pos);
          startWatcher();
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            runtime.current.intent = false;
            runtime.current.permissionGranted = false;
            setStatus("denied");
            return;
          }
          // Unavailable / timeout right now — still start the watch; a fix may arrive later.
          if (runtime.current.intent) startWatcher();
        },
        GEO_OPTIONS,
      );
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          if (res.state === "denied") {
            runtime.current.intent = false;
            setStatus("denied");
            return;
          }
          runtime.current.permissionGranted = res.state === "granted";
          begin();
        })
        .catch(() => begin());
    } else {
      begin();
    }
  }, [onFix, startWatcher]);

  const stop = useCallback(() => {
    const { eventId } = latest.current;
    // Best-effort: fire off whatever is buffered before we mark the stop (flush captures the
    // points synchronously, so the later buffer reset can't race it).
    void flush();
    const r = runtime.current;
    r.intent = false;
    if (eventId) setStopped(eventId, true);
    teardown();
    r.buffer = [];
    setStatus("off");
    setSelfPosition(null);
  }, [flush, teardown]);

  // Never transmit for a stale event id: hard reset on event switch and on unmount (which is
  // also what covers logout — the live page unmounts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: eventId is here so the cleanup runs when the id changes, tearing the old watcher down before a new event's watcher can start — the effect body reads it only via `latest.current`.
  useEffect(() => {
    return () => {
      teardown();
      const r = runtime.current;
      r.buffer = [];
      r.intent = false;
      r.permissionGranted = false;
      setStatus("off");
      setSelfPosition(null);
    };
  }, [eventId, teardown]);

  // The event finished, the rider left, or it's no longer live → stop, and stay stopped (the
  // resume path re-checks the same conditions before it would restart).
  useEffect(() => {
    const r = runtime.current;
    if (r.watchId == null && r.intervalId == null) return;
    if (eventIsFinished || participantId == null || !eventIsLive) {
      teardown();
      r.buffer = [];
      r.intent = false;
      setStatus("off");
      setSelfPosition(null);
    }
  }, [eventIsFinished, participantId, eventIsLive, teardown]);

  // Return-from-background: the OS may have frozen JS / GPS. Recreate the watcher if it looks
  // dead — but first re-confirm the event is still live, so a ride that finished while we were
  // backgrounded does NOT start transmitting again.
  useEffect(() => {
    let cancelled = false;

    const resume = async () => {
      if (document.visibilityState === "hidden") return;
      const r = runtime.current;
      const { eventId, participantId } = latest.current;
      if (!r.intent || !eventId || participantId == null) return;
      if (isStopped(eventId)) return;

      try {
        const fresh = await apiRequest<{ status: string; effectiveStatus?: string }>(
          `/events/${eventId}`,
        );
        if (cancelled) return;
        const effective = fresh.effectiveStatus ?? fresh.status;
        if (effective !== "live") {
          teardown();
          r.intent = false;
          r.buffer = [];
          setStatus("off");
          setSelfPosition(null);
          return;
        }
      } catch {
        // Couldn't confirm (offline). Fall through and resume anyway — uploads just queue until
        // connectivity returns, and the next successful resume-check will catch a finished ride.
      }
      if (cancelled) return;

      // Watcher assumed alive only if it produced a fix recently; otherwise recreate it.
      const alive =
        r.watchId != null && Date.now() - r.lastFixAt < config.locationBatchIntervalMs * 2;
      if (!alive) startWatcher();
      void flush();
    };

    const onVisibility = () => void resume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [teardown, startWatcher, flush]);

  return { status, start, stop, selfPosition };
}
