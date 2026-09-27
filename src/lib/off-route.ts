// Pure "am I off route" state machine. Distance-to-route calculation itself reuses
// lib/geo.ts's nearestPointOnRoute + haversineDistanceKm (already used for the traveled-portion
// overlay on the live map) — this file only decides, from a stream of distance samples, when
// that reading has become a real, sustained deviation worth warning about, as opposed to one
// noisy GPS fix. The stateful wiring (reading GPS, vibration, speech, cooldown-in-wall-clock)
// lives in app/useOffRouteWarning.ts; everything here is a plain function so it is unit-testable
// with fabricated timestamps and no DOM.
//
// This is NOT navigation — it never suggests a direction or a way back, only "you have drifted
// from the route", which is all El Niño promises (plan/prompt.md: not a turn-by-turn project).

export interface OffRouteConfig {
  /** Below this, the rider is unambiguously on the route. Metres. */
  normalDistanceM: number;
  /** At or above this, a sample starts (or continues) counting toward a warning. Metres.
   *  Deliberately higher than normalDistanceM: the gap between the two is a dead zone where a
   *  reading neither resets nor advances the timer, so GPS jitter sitting right at one
   *  threshold can't flap the state back and forth. */
  warnDistanceM: number;
  /** How long the distance must stay at/above warnDistanceM, continuously, before it becomes a
   *  confirmed warning (not just a candidate). Milliseconds. */
  persistMs: number;
  /** Minimum gap between two alerts (vibration/speech), so a rider who stays off-route doesn't
   *  get buzzed every tick. Milliseconds. Cleared early if the rider returns to the route and
   *  then drifts off again — see evaluateOffRoute. */
  cooldownMs: number;
}

/** Conservative defaults from the spec: normal < 50 m, candidate >= 70 m, persist ~18 s,
 *  cooldown a few minutes. Exported as plain numbers (not frozen/branded) so a caller can
 *  override one field with `{ ...DEFAULT_OFF_ROUTE_CONFIG, persistMs: 10_000 }` for testing. */
export const DEFAULT_OFF_ROUTE_CONFIG: OffRouteConfig = {
  normalDistanceM: 50,
  warnDistanceM: 70,
  persistMs: 18_000,
  cooldownMs: 5 * 60_000,
};

export interface OffRouteState {
  /** When the current run of >= warnDistanceM samples started, or null while on-route / in the
   *  dead zone with no run in progress. */
  offRouteSinceMs: number | null;
  /** The confirmed (persisted) state — what the visual banner shows. */
  isWarning: boolean;
  /** When an alert (vibration/speech) last actually fired, or null. */
  lastAlertAtMs: number | null;
}

export const INITIAL_OFF_ROUTE_STATE: OffRouteState = {
  offRouteSinceMs: null,
  isWarning: false,
  lastAlertAtMs: null,
};

export interface OffRouteResult {
  state: OffRouteState;
  /** True exactly on the tick a NEW alert should fire (vibration/speech) — never true while
   *  merely remaining in an already-warned, still-off-route, still-in-cooldown state. */
  alert: boolean;
}

/**
 * One new distance sample in. Pure — same inputs always give the same outputs, so a test can
 * feed a scripted sequence of (distance, time) pairs without any timers or GPS.
 */
export function evaluateOffRoute(
  state: OffRouteState,
  distanceM: number,
  nowMs: number,
  config: OffRouteConfig = DEFAULT_OFF_ROUTE_CONFIG,
): OffRouteResult {
  // Back on route: full reset, including the cooldown — a rider who corrects course and then
  // drifts off again gets a fresh warning rather than waiting out the original cooldown.
  if (distanceM < config.normalDistanceM) {
    return {
      state: { offRouteSinceMs: null, isWarning: false, lastAlertAtMs: null },
      alert: false,
    };
  }

  // The dead zone between "normal" and "warn": neither confirms nor resets. A single noisy fix
  // landing here can't by itself end an in-progress run, and can't start one either.
  if (distanceM < config.warnDistanceM) {
    return { state, alert: false };
  }

  // >= warnDistanceM: start (or continue) the run.
  const offRouteSinceMs = state.offRouteSinceMs ?? nowMs;
  const persisted = nowMs - offRouteSinceMs >= config.persistMs;

  if (!persisted) {
    return { state: { ...state, offRouteSinceMs, isWarning: false }, alert: false };
  }

  const cooledDown =
    state.lastAlertAtMs == null || nowMs - state.lastAlertAtMs >= config.cooldownMs;
  return {
    state: {
      offRouteSinceMs,
      isWarning: true,
      lastAlertAtMs: cooledDown ? nowMs : state.lastAlertAtMs,
    },
    alert: cooledDown,
  };
}
