/**
 * The emergency OFF switch for Ride Studio, changeable WITHOUT a redeploy.
 *
 * `/ride-studio-config.json` is a tiny static file shipped with the app (public/). The app asks
 * for it fresh (`no-store`) when the New Ride entry first renders. Setting it to
 * `{"enabled": false}` on the server (edit /var/www/elnino/ride-studio-config.json) turns
 * Ride Studio off for everyone: New Ride goes straight to the original form again, on the next
 * page load of each user. The default is ON, so a missing file, a network error, a timeout or
 * anything that is not an explicit `"enabled": false` leaves the studio on, and the original form
 * is never affected either way. (A later deploy ships the repo's copy, which says enabled: true.)
 */

import { useSyncExternalStore } from "react";

export const RUNTIME_CONFIG_URL = "/ride-studio-config.json";
const TIMEOUT_MS = 2500;

export interface RuntimeSwitch {
  /** False only when the file says so. */
  enabled: boolean;
  /** True once the file has been read (or has failed to be, which means "default on"). */
  settled: boolean;
}

let state: RuntimeSwitch = { enabled: true, settled: false };
let started = false;
const listeners = new Set<() => void>();

function set(next: RuntimeSwitch) {
  state = next;
  for (const l of listeners) l();
}

/** The value in a fetched file: false only for an explicit `{"enabled": false}`. */
export function parseRuntimeConfig(value: unknown): boolean {
  if (value && typeof value === "object" && (value as { enabled?: unknown }).enabled === false) {
    return false;
  }
  return true;
}

/** Reads the file once per page load. Safe to call from anywhere, any number of times. */
export function startRuntimeConfig(fetchImpl: typeof fetch | undefined = globalThis.fetch): void {
  if (started) return;
  started = true;
  if (typeof fetchImpl !== "function") {
    set({ enabled: true, settled: true });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  fetchImpl(`${RUNTIME_CONFIG_URL}?t=${Date.now()}`, {
    cache: "no-store",
    signal: controller.signal,
    headers: { accept: "application/json" },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => set({ enabled: parseRuntimeConfig(json), settled: true }))
    .catch(() => set({ enabled: true, settled: true }))
    .finally(() => clearTimeout(timer));
}

export function getRuntimeSwitch(): RuntimeSwitch {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The switch as React state; the first caller starts the one-time read. */
export function useRuntimeSwitch(): RuntimeSwitch {
  startRuntimeConfig();
  return useSyncExternalStore(subscribe, getRuntimeSwitch, getRuntimeSwitch);
}

/** Test-only: forget everything, so each test starts from "not read yet". */
export function resetRuntimeConfigForTests(next: Partial<RuntimeSwitch> = {}): void {
  started = Boolean(next.settled);
  state = { enabled: true, settled: false, ...next };
  for (const l of listeners) l();
}
