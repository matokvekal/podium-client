/**
 * Off-route detection for the live map — NOT navigation. Watches the rider's own GPS fix
 * against the route polyline (lib/geo.ts's nearestPointOnRoute, the same projection the
 * traveled-portion overlay already uses) and raises a local, lightweight warning once the
 * deviation is sustained, never from one noisy sample. See lib/off-route.ts for the pure
 * threshold/persistence/cooldown state machine this hook drives.
 *
 * On a confirmed new alert: a visual flag (the caller draws the banner — no UI decisions made
 * here), plus vibration and/or speech where the browser supports them. Neither is required —
 * `navigator.vibrate` and `SpeechSynthesis` are optional Web APIs and this hook no-ops cleanly
 * when either (or both) is absent, per the spec's "visual warning still works" guarantee.
 */

import { useEffect, useRef, useState } from "react";
import { haversineDistanceKm, nearestPointOnRoute } from "../lib/geo";
import {
  DEFAULT_OFF_ROUTE_CONFIG,
  evaluateOffRoute,
  INITIAL_OFF_ROUTE_STATE,
  type OffRouteConfig,
} from "../lib/off-route";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
    window.speechSynthesis.cancel(); // never stack utterances behind a slow one
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // Unsupported / blocked — the visual banner still carries the warning.
  }
}

function vibrate(): void {
  try {
    if (prefersReducedMotion()) return;
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Unsupported — nothing to do.
  }
}

interface Params {
  enabled: boolean;
  selfPosition: [number, number] | null;
  routePoints: readonly [number, number][];
  /** Off unless explicitly turned on — the map screen owns whether sound/vibration are wanted. */
  alertsEnabled?: boolean;
  config?: OffRouteConfig;
}

export function useOffRouteWarning({
  enabled,
  selfPosition,
  routePoints,
  alertsEnabled = true,
  config = DEFAULT_OFF_ROUTE_CONFIG,
}: Params): { isWarning: boolean } {
  const [isWarning, setIsWarning] = useState(false);
  const stateRef = useRef(INITIAL_OFF_ROUTE_STATE);
  // Which routePoints array the state above was computed against — a new route (different
  // array identity: a fresh fetch, or switching rides) resets the run/cooldown instead of
  // judging a fresh polyline by a previous one's history.
  const lastRoutePointsRef = useRef(routePoints);

  useEffect(() => {
    if (!enabled || !selfPosition || routePoints.length === 0) return;
    if (lastRoutePointsRef.current !== routePoints) {
      stateRef.current = INITIAL_OFF_ROUTE_STATE;
      lastRoutePointsRef.current = routePoints;
    }
    const nearest = nearestPointOnRoute(routePoints, selfPosition);
    if (nearest.index < 0) return;
    const distanceM = haversineDistanceKm(selfPosition, nearest.point) * 1000;

    const { state, alert } = evaluateOffRoute(stateRef.current, distanceM, Date.now(), config);
    stateRef.current = state;
    setIsWarning(state.isWarning);

    if (alert && alertsEnabled) {
      vibrate();
      speak("You are off route.");
    }
  }, [enabled, selfPosition, routePoints, config, alertsEnabled]);

  return { isWarning };
}
