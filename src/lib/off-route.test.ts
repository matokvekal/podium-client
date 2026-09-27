import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFF_ROUTE_CONFIG,
  evaluateOffRoute,
  INITIAL_OFF_ROUTE_STATE,
  type OffRouteConfig,
} from "./off-route";

// Short, fast thresholds for the tests — the pure function takes wall-clock time as a plain
// number, so no fake timers are needed anywhere here.
const CONFIG: OffRouteConfig = {
  normalDistanceM: 50,
  warnDistanceM: 70,
  persistMs: 1_000,
  cooldownMs: 5_000,
};

describe("evaluateOffRoute", () => {
  it("on route: no warning", () => {
    const { state, alert } = evaluateOffRoute(INITIAL_OFF_ROUTE_STATE, 10, 0, CONFIG);
    expect(state.isWarning).toBe(false);
    expect(alert).toBe(false);
  });

  it("a single noisy spike past the warn threshold does not immediately warn", () => {
    const { state, alert } = evaluateOffRoute(INITIAL_OFF_ROUTE_STATE, 90, 0, CONFIG);
    expect(state.isWarning).toBe(false);
    expect(alert).toBe(false);
  });

  it("a spike that drops back under the normal threshold on the next sample never persists", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    ({ state } = evaluateOffRoute(state, 90, 0, CONFIG));
    ({ state } = evaluateOffRoute(state, 10, 200, CONFIG)); // back under normal quickly
    const { state: after, alert } = evaluateOffRoute(state, 90, 1_200, CONFIG);
    // The run restarted at t=1200 (the t=200 sample reset it), so persistMs hasn't elapsed yet.
    expect(after.isWarning).toBe(false);
    expect(alert).toBe(false);
  });

  it("sustained deviation past persistMs raises exactly one warning", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    let alerted = false;
    ({ state } = evaluateOffRoute(state, 90, 0, CONFIG));
    ({ state } = evaluateOffRoute(state, 90, 500, CONFIG));
    const third = evaluateOffRoute(state, 90, 1_100, CONFIG); // 1100ms since the run started
    state = third.state;
    alerted = third.alert;
    expect(state.isWarning).toBe(true);
    expect(alerted).toBe(true);
  });

  it("the dead zone between normal and warn neither confirms nor resets an in-progress run", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    ({ state } = evaluateOffRoute(state, 90, 0, CONFIG)); // start the run
    ({ state } = evaluateOffRoute(state, 60, 500, CONFIG)); // dead zone sample, mid-run
    const { state: after, alert } = evaluateOffRoute(state, 90, 1_100, CONFIG);
    // Still counts from t=0, so 1100ms has elapsed and it persists.
    expect(after.isWarning).toBe(true);
    expect(alert).toBe(true);
  });

  it("cooldown suppresses a second alert while still off-route", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    ({ state } = evaluateOffRoute(state, 90, 0, CONFIG));
    let r = evaluateOffRoute(state, 90, 1_100, CONFIG);
    state = r.state;
    expect(r.alert).toBe(true);

    // Still off-route, well within the 5s cooldown.
    r = evaluateOffRoute(state, 90, 2_000, CONFIG);
    expect(r.alert).toBe(false);
    expect(r.state.isWarning).toBe(true); // still shown as a warning, just no new alert
  });

  it("cooldown expires and a still-off-route rider can alert again", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    let r = evaluateOffRoute(state, 90, 0, CONFIG);
    state = r.state;
    r = evaluateOffRoute(state, 90, 1_100, CONFIG); // first alert
    state = r.state;
    expect(r.alert).toBe(true);

    r = evaluateOffRoute(state, 90, 1_100 + CONFIG.cooldownMs + 1, CONFIG);
    expect(r.alert).toBe(true);
  });

  it("returning to route resets state and clears the cooldown early", () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    let r = evaluateOffRoute(state, 90, 0, CONFIG);
    state = r.state;
    r = evaluateOffRoute(state, 90, 1_100, CONFIG); // alert fires, cooldown starts
    state = r.state;
    expect(r.alert).toBe(true);

    r = evaluateOffRoute(state, 10, 1_200, CONFIG); // back on route
    state = r.state;
    expect(state.isWarning).toBe(false);

    // Immediately off-route again, well within the original 5s cooldown window — still alerts,
    // because returning to route cleared it.
    r = evaluateOffRoute(state, 90, 1_300, CONFIG);
    state = r.state;
    r = evaluateOffRoute(state, 90, 2_400, CONFIG); // persistMs later
    expect(r.alert).toBe(true);
  });

  it("the shipped defaults match the spec's example thresholds", () => {
    expect(DEFAULT_OFF_ROUTE_CONFIG.normalDistanceM).toBe(50);
    expect(DEFAULT_OFF_ROUTE_CONFIG.warnDistanceM).toBe(70);
    expect(DEFAULT_OFF_ROUTE_CONFIG.persistMs).toBeGreaterThanOrEqual(15_000);
    expect(DEFAULT_OFF_ROUTE_CONFIG.persistMs).toBeLessThanOrEqual(20_000);
  });
});
