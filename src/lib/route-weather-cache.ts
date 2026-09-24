// Browser-local cache for route weather. localStorage only, own key prefix, own TTL — kept
// separate from wind-cache.ts (the hourly wind strip's cache) by design: no shared cache between
// the two features (asked for directly).
//
// KEY: `elnino.routeWeather.<userId>.<eventId>` — per user AND per ride, so two riders sharing a
// device never see each other's cached forecast, and the `elnino.*` sign-out wipe in
// lib/logout-cleanup.ts still removes it with everything else.
//
// Every access is guarded: storage can be missing, full, or throw (private mode). A cache that
// cannot be read or written is just a cache miss — the section carries on without it.

import type { RouteWeatherReading } from "./route-weather-provider";

export const ROUTE_WEATHER_CACHE_PREFIX = "elnino.routeWeather.";

/** How long a fetched forecast is trusted before it is considered worth refreshing. */
export const ROUTE_WEATHER_CACHE_TTL_MS = 5 * 60 * 60 * 1000;

const CACHE_VERSION = 1;

/** The slice of Storage this needs, so tests can pass a plain in-memory object. */
export type RouteWeatherStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RouteWeatherCacheEntry {
  v: number;
  userId: string;
  eventId: string;
  /** Which ride, start, duration and sampled points these were made for. */
  signature: string;
  /** Epoch ms of the fetch — shown as "Updated 2h ago" and the basis of the TTL. */
  generatedAt: number;
  samples: RouteWeatherReading[];
}

export function routeWeatherCacheKey(userId: string, eventId: string): string {
  return `${ROUTE_WEATHER_CACHE_PREFIX}${userId}.${eventId}`;
}

function defaultStorage(): RouteWeatherStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isReading(value: unknown): value is RouteWeatherReading {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.label === "string" &&
    typeof r.lat === "number" &&
    typeof r.lng === "number" &&
    typeof r.etaMs === "number" &&
    (r.weatherCode === null || typeof r.weatherCode === "number") &&
    (r.isDay === null || typeof r.isDay === "boolean") &&
    (r.temperatureC === null || typeof r.temperatureC === "number")
  );
}

function parseEntry(raw: string | null): RouteWeatherCacheEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Partial<RouteWeatherCacheEntry>;
    if (entry.v !== CACHE_VERSION) return null;
    if (typeof entry.userId !== "string" || typeof entry.eventId !== "string") return null;
    if (typeof entry.signature !== "string" || typeof entry.generatedAt !== "number") return null;
    if (!Array.isArray(entry.samples) || !entry.samples.every(isReading)) return null;
    return entry as RouteWeatherCacheEntry;
  } catch {
    return null;
  }
}

/**
 * The cached forecast for this rider's ride, only if it was made for THIS plan as it is now —
 * same user, event, start, duration and sampled points. Anything else reads as a miss.
 */
export function readRouteWeatherCache(
  userId: string,
  eventId: string,
  signature: string,
  storage: RouteWeatherStorage | null = defaultStorage(),
): RouteWeatherCacheEntry | null {
  if (!storage) return null;
  try {
    const entry = parseEntry(storage.getItem(routeWeatherCacheKey(userId, eventId)));
    if (!entry || entry.userId !== userId || entry.eventId !== eventId) return null;
    if (entry.signature !== signature) return null;
    return entry;
  } catch {
    return null;
  }
}

/** Fresh = generated within the TTL. A timestamp from the future (clock change) is not fresh. */
export function isRouteWeatherCacheFresh(entry: RouteWeatherCacheEntry, nowMs: number): boolean {
  const age = nowMs - entry.generatedAt;
  return age >= 0 && age < ROUTE_WEATHER_CACHE_TTL_MS;
}

export function writeRouteWeatherCache(
  entry: Omit<RouteWeatherCacheEntry, "v">,
  storage: RouteWeatherStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      routeWeatherCacheKey(entry.userId, entry.eventId),
      JSON.stringify({ v: CACHE_VERSION, ...entry }),
    );
  } catch {
    // Quota or disabled storage: the forecast is still shown this session, just not kept.
  }
}
