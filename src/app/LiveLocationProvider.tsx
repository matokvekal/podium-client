/**
 * The single owner of live-location tracking for the whole app. Mounted once at the app root
 * (App.tsx, next to FastResume — same "renders nothing, needs no parent" shape) so there is
 * exactly one navigator.geolocation.watchPosition instance no matter which screen the rider is
 * looking at, and so leaving the Live map for another screen inside the app does not itself
 * stop tracking.
 *
 * Root cause this replaces: tracking used to be owned by LiveEventPage itself — a
 * `useLocationBroadcast()` call scoped to that one page, auto-started from an effect that
 * trusted whatever `event.myParticipant` the page's own state happened to hold. That state
 * could be a cache/offline stand-in with `myParticipant` hardcoded to null (see
 * EventDetailPage's detailFromCachedSummary / LiveEventPage's liveInfoFromCachedSummary) while
 * the real GET /events/:eventId was still in flight or had failed once on bad signal — exactly
 * the outdoor-ride-start scenario. The route still rendered (a wholly separate fetch, the
 * results store), so the map looked fine while tracking silently never started. Moving
 * ownership here does not fix that by itself; what fixes it is the *rule* for setting
 * `activeRide` (see store/liveLocationStore.ts): only a confirmed, non-cached server response
 * may claim or withdraw it, and this provider periodically reconfirms it independently of
 * whichever page is currently mounted (see the re-verify effect below), so a stale first
 * attempt gets a real second chance instead of a permanent silent "not a participant".
 *
 * Ownership rule, unchanged from the old hook: exactly one watchPosition + one upload interval
 * at a time, restarted safely on foreground/resume, torn down when there is no active ride to
 * track — all still implemented by useLocationBroadcast.ts, just called from here instead of a
 * page component.
 */

import { useEffect, useRef } from "react";
import { apiRequest } from "../lib/api-client";
import { isLocationManuallyStopped } from "../lib/location-broadcast";
import { useLiveLocationStore } from "../store/liveLocationStore";
import { setLiveLocationImpl } from "./liveLocationController";
import { useLocationBroadcast } from "./useLocationBroadcast";

/** How often to reconfirm a currently-active ride is still live and the rider still on it,
 *  independent of any page's own polling — the thing that makes "stop tracking once no active
 *  registered ride exists" true even while the rider is on an unrelated screen (chat, stops)
 *  rather than only on the ride/live pages that also happen to reconfirm it themselves. */
const REVERIFY_INTERVAL_MS = 120_000;

export function LiveLocationProvider() {
  const activeRide = useLiveLocationStore((s) => s.activeRide);
  const setStatus = useLiveLocationStore((s) => s.setStatus);
  const setSelfPosition = useLiveLocationStore((s) => s.setSelfPosition);
  const clearActiveRideIfCurrent = useLiveLocationStore((s) => s.clearActiveRideIfCurrent);

  const broadcast = useLocationBroadcast({
    eventId: activeRide?.eventId,
    participantId: activeRide?.participantId ?? null,
    // By construction activeRide is only ever set to a ride confirmed live and not finished
    // (see setActiveRide's callers) — clearing it is how "stop" is expressed, not flipping
    // these to false while the id stays put.
    eventIsLive: activeRide != null,
    eventIsFinished: false,
  });

  // Mirror the hook's own state into the shared store, so any page can read it without being
  // the one that called the hook.
  useEffect(() => {
    setStatus(broadcast.status);
  }, [broadcast.status, setStatus]);
  useEffect(() => {
    setSelfPosition(broadcast.selfPosition);
  }, [broadcast.selfPosition, setSelfPosition]);

  // Wire the imperative start/stop bridge (app/liveLocationController.ts) so a page's manual
  // Share/Stop button reaches the one real watcher without prop-drilling it through the route
  // tree. Re-wired whenever the callbacks change identity (they are stable useCallbacks, so in
  // practice this runs once) and cleared on unmount, which never happens for a component
  // mounted at the app root outside of a hot-reload.
  useEffect(() => {
    setLiveLocationImpl({ start: broadcast.start, stop: broadcast.stop });
    return () => setLiveLocationImpl(null);
  }, [broadcast.start, broadcast.stop]);

  // Auto-start: the moment a page confirms an active ride (or this provider's own re-verify
  // below does), begin tracking — unless the rider explicitly stopped sharing for this exact
  // ride this session. Mirrors the effect that used to live in LiveEventPage; moved here so it
  // fires no matter which page (or no ride page at all) made the confirmation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: broadcast.start is a stable useCallback
  useEffect(() => {
    if (!activeRide) return;
    if (broadcast.status !== "off") return;
    if (isLocationManuallyStopped(activeRide.eventId)) return;
    broadcast.start();
  }, [activeRide, broadcast.status]);

  // Re-verify the active ride on an interval AND on foreground/resume, independent of whether
  // the rider is currently looking at any ride-related screen. A ride that finished (or a
  // registration that was pulled) while the rider was reading chat or the stop list must not
  // keep transmitting indefinitely just because no page happened to notice.
  const activeRideRef = useRef(activeRide);
  activeRideRef.current = activeRide;
  useEffect(() => {
    let cancelled = false;

    async function reverify() {
      const ride = activeRideRef.current;
      if (!ride) return;
      if (document.visibilityState === "hidden") return;
      try {
        const fresh = await apiRequest<{
          status: string;
          effectiveStatus?: string;
          myParticipant: { id: number } | null;
        }>(`/events/${ride.eventId}`);
        if (cancelled || activeRideRef.current?.eventId !== ride.eventId) return;
        const effective = fresh.effectiveStatus ?? fresh.status;
        if (effective !== "live" || fresh.myParticipant == null) {
          clearActiveRideIfCurrent(ride.eventId);
        }
      } catch {
        // Offline / transient failure — say nothing here. This is a periodic double-check, not
        // the primary signal; leaving the current activeRide alone is the safe default (the
        // hook's own resume-check already handles "confirm still live" before restarting a
        // watcher that looked dead, and a genuinely finished ride will be caught on the next
        // successful tick, or by whichever page the rider next opens).
      }
    }

    const id = window.setInterval(() => void reverify(), REVERIFY_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reverify();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [clearActiveRideIfCurrent]);

  return null;
}
