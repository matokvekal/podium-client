// Browser-local cache for the wind pilot. localStorage only — a forecast is temporary data, so it
// is never sent to the server or stored in the database, and a second device simply fetches its
// own copy.
//
// KEY: `elnino.wind.<eventId>`. The dot (not a colon) is deliberate: lib/logout-cleanup.ts wipes
// every `elnino.*` key on sign-out, so a cached forecast does not outlive the session on a
// shared device, and no second cleanup mechanism is needed.
//
// Every access is guarded: storage can be missing, full, or throw (private mode). A cache that
// cannot be read or written is just a cache miss — the feature carries on without it.

import type { WindSample } from "./wind-model";

export const WIND_CACHE_PREFIX = "elnino.wind.";

/** How long a fetched forecast is trusted before the next open fetches a fresher one. */
export const WIND_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** A cached forecast is dropped once its window is this long past — nobody will open it again. */
const PRUNE_AFTER_RIDE_MS = 24 * 60 * 60 * 1000;

// v2: the position-along-the-route model (km / heading per sample) was dropped for a plain
// hourly window. v3: samples carry the air temperature. v4: samples carry a sky-condition code
// and day/night flag. Older entries read as a miss.
const CACHE_VERSION = 4;

/** The slice of Storage this needs, so tests can pass a plain in-memory object. */
export type WindStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export interface WindCacheEntry {
  v: number;
  eventId: string;
  /** provider + WindPlan.signature: which ride, start, duration and place these were made for. */
  signature: string;
  /** Epoch ms of the fetch — shown as "updated 06:12" and the basis of the TTL. */
  fetchedAt: number;
  samples: WindSample[];
}

export function windCacheKey(eventId: string): string {
  return `${WIND_CACHE_PREFIX}${eventId}`;
}

function defaultStorage(): WindStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isSample(value: unknown): value is WindSample {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.timeMs === "number" &&
    typeof s.speedKmh === "number" &&
    typeof s.directionDeg === "number" &&
    (s.gustKmh === null || typeof s.gustKmh === "number") &&
    (s.temperatureC === null || typeof s.temperatureC === "number") &&
    (s.weatherCode === null || typeof s.weatherCode === "number") &&
    (s.isDay === null || typeof s.isDay === "boolean")
  );
}

function parseEntry(raw: string | null): WindCacheEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Partial<WindCacheEntry>;
    if (entry.v !== CACHE_VERSION) return null;
    if (typeof entry.eventId !== "string" || typeof entry.signature !== "string") return null;
    if (typeof entry.fetchedAt !== "number" || !Array.isArray(entry.samples)) return null;
    if (entry.samples.length === 0 || !entry.samples.every(isSample)) return null;
    return entry as WindCacheEntry;
  } catch {
    return null;
  }
}

/**
 * The cached forecast for this event, only if it was made for THIS ride as it is now — same
 * event id, start, duration and route. Anything else reads as a miss.
 */
export function readWindCache(
  eventId: string,
  signature: string,
  storage: WindStorage | null = defaultStorage(),
): WindCacheEntry | null {
  if (!storage) return null;
  try {
    const entry = parseEntry(storage.getItem(windCacheKey(eventId)));
    if (!entry || entry.eventId !== eventId || entry.signature !== signature) return null;
    return entry;
  } catch {
    return null;
  }
}

/** Fresh = fetched within the TTL. A timestamp from the future (clock change) is not fresh. */
export function isWindCacheFresh(entry: WindCacheEntry, nowMs: number): boolean {
  const age = nowMs - entry.fetchedAt;
  return age >= 0 && age < WIND_CACHE_TTL_MS;
}

/** Replaces this event's entry, and sweeps out entries for rides long gone. */
export function writeWindCache(
  entry: Omit<WindCacheEntry, "v">,
  nowMs: number,
  storage: WindStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(windCacheKey(entry.eventId), JSON.stringify({ v: CACHE_VERSION, ...entry }));
  } catch {
    // Quota or disabled storage: the forecast is still shown this session, just not kept.
  }
  pruneWindCache(nowMs, storage);
}

export function pruneWindCache(nowMs: number, storage: WindStorage | null = defaultStorage()) {
  if (!storage) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(WIND_CACHE_PREFIX)) continue;
      const entry = parseEntry(storage.getItem(key));
      const last = entry?.samples[entry.samples.length - 1]?.timeMs;
      if (last == null || last < nowMs - PRUNE_AFTER_RIDE_MS) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Housekeeping only.
  }
}
