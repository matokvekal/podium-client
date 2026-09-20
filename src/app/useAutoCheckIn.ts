/**
 * Auto check-in at the start: while the app is open and a ride the signed-in rider is on is
 * inside its check-in window, take ONE GPS fix and ask the server whether it counts as arriving.
 * The server (POST /events/:eventId/participants/me/check-in) decides everything — the organizer's
 * switch, the time window, the radius, the GPS accuracy — and records the arrival as "auto".
 * This hook only decides when it is worth asking. See lib/auto-check-in.ts for those rules.
 *
 * What it will and will not do:
 *   - It never asks for a location for a ride that is not inside its window, so a rider is not
 *     prompted for GPS a week before the ride, and never for a ride they only organize.
 *   - One fix per attempt, shared by every due ride. There is no watcher: this is not tracking.
 *   - Retries on open, on returning to the app, and once a minute while a ride is due — a rider
 *     who opened the app in the car park is checked in when they reach the start line.
 *   - A final answer (checked in, switched off, an organizer decided, no start point) stops the
 *     asking for that ride for the rest of the session; "not there yet" does not.
 *   - Permission denied stops it for the session. It never re-prompts in a loop.
 *
 * Mounted once, in AppShell, because "opens the app" is not a page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import {
  type AutoCheckInOutcome,
  isFinalOutcome,
  shouldAttemptAutoCheckIn,
} from "../lib/auto-check-in";
import { config } from "../lib/config";
import { useEventsStore } from "../store/eventsStore";

interface CheckInReply {
  outcome: AutoCheckInOutcome;
  distanceM: number | null;
}

/** The ride the rider was just checked in to, for the confirmation banner. */
export interface AutoCheckedInRide {
  id: string;
  name: string;
}

interface Result {
  /** Set for a few seconds after an automatic check-in, then cleared. */
  arrived: AutoCheckedInRide | null;
  dismiss(): void;
}

// A fix up to 15 s old is fine (the rider is standing still at the start), and waiting longer than
// 15 s for one means a phone with no sky view — better to try again on the next tick.
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 15_000,
};

/** Focus and visibilitychange fire together on a tab switch; one attempt is enough. */
const MIN_GAP_MS = 10_000;

function getFix(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

async function locationBlocked(): Promise<boolean> {
  try {
    const permission = await navigator.permissions?.query({ name: "geolocation" });
    return permission?.state === "denied";
  } catch {
    // No Permissions API (older Safari) — the getCurrentPosition error below is the signal.
    return false;
  }
}

export function useAutoCheckIn(): Result {
  const { status } = useAuth();
  const myRides = useEventsStore((s) => s.myRides);
  const joinedRideIds = useEventsStore((s) => s.joinedRideIds);
  const myRidesLoading = useEventsStore((s) => s.myRidesLoading);
  const loadMyRides = useEventsStore((s) => s.loadMyRides);
  const signedIn = status === "signed-in";

  const [arrived, setArrived] = useState<AutoCheckedInRide | null>(null);

  // What the async callbacks read to get current values without being re-created.
  const latest = useRef({ myRides, joinedRideIds, signedIn });
  latest.current = { myRides, joinedRideIds, signedIn };

  const settled = useRef(new Set<string>());
  const busy = useRef(false);
  const lastRunAt = useRef(0);
  const geoDenied = useRef(false);
  const requestedRides = useRef(false);

  const attempt = useCallback(async () => {
    const { myRides, joinedRideIds, signedIn } = latest.current;
    if (!signedIn || busy.current || geoDenied.current) return;
    if (document.visibilityState === "hidden") return;
    if (!("geolocation" in navigator)) return;

    const now = Date.now();
    if (now - lastRunAt.current < MIN_GAP_MS) return;

    const joined = new Set(joinedRideIds);
    const due = myRides.filter(
      (ride) =>
        !settled.current.has(ride.id) &&
        shouldAttemptAutoCheckIn(ride, joined, now, config.autoCheckInWindowMin),
    );
    // Nothing due: no fix, no prompt, and lastRunAt stays put so the moment a ride's list
    // arrives it can run straight away.
    if (due.length === 0) return;

    busy.current = true;
    try {
      if (await locationBlocked()) return;
      lastRunAt.current = Date.now();

      let fix: GeolocationPosition;
      try {
        fix = await getFix();
      } catch (err) {
        // Denied: stop for the session. Anything else (no signal, timeout) is transient.
        if ((err as GeolocationPositionError).code === 1) geoDenied.current = true;
        return;
      }

      for (const ride of due) {
        try {
          const reply = await apiRequest<CheckInReply>(
            `/events/${ride.id}/participants/me/check-in`,
            {
              method: "POST",
              body: {
                lat: fix.coords.latitude,
                lng: fix.coords.longitude,
                ...(Number.isFinite(fix.coords.accuracy) ? { accuracy: fix.coords.accuracy } : {}),
              },
            },
          );
          if (isFinalOutcome(reply.outcome)) settled.current.add(ride.id);
          if (reply.outcome === "arrived") setArrived({ id: ride.id, name: ride.name });
        } catch (err) {
          // 403 = no start-list row, 404 = a ride this account cannot see: neither will change
          // by asking again. Anything else (offline, 5xx) is left to the next tick.
          if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
            settled.current.add(ride.id);
          }
        }
      }
    } finally {
      busy.current = false;
    }
  }, []);

  // Cold start on a page that is not My Rides (a shared link, a bookmarked ride): the store is
  // empty, so ask for the rider's rides once. Harmless if the list page loads them too — the store
  // discards the older response.
  useEffect(() => {
    if (!signedIn) {
      // A different rider may sign in on this device next: nothing carries over.
      settled.current.clear();
      geoDenied.current = false;
      requestedRides.current = false;
      setArrived(null);
      return;
    }
    if (myRides.length === 0 && !myRidesLoading && !requestedRides.current) {
      requestedRides.current = true;
      void loadMyRides(true);
    }
  }, [signedIn, myRides.length, myRidesLoading, loadMyRides]);

  // Open / return to the app / a minute passes / the ride list arrives or changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: myRides and joinedRideIds are here on purpose — a new list is the trigger; the body reads them through `latest.current`.
  useEffect(() => {
    if (!signedIn) return;

    void attempt();
    const onReturn = () => {
      if (document.visibilityState === "visible") void attempt();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const timer = window.setInterval(() => void attempt(), config.autoCheckInRetryMs);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.clearInterval(timer);
    };
  }, [signedIn, myRides, joinedRideIds, attempt]);

  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setArrived(null), config.autoCheckInToastMs);
    return () => window.clearTimeout(timer);
  }, [arrived]);

  const dismiss = useCallback(() => setArrived(null), []);
  return { arrived, dismiss };
}
