// Orchestrates one event's wind forecast: cache → provider → cache. No React, no DOM.
//
// The order, for an eligible viewer (eligibility itself is decided BEFORE this is called — see
// lib/wind-eligibility.ts; nothing here checks who is asking):
//   1. a cached forecast made for this exact ride and younger than the TTL is used as is;
//   2. otherwise ONE batched request goes to the provider and the cache is replaced;
//   3. if that request fails, an older cached forecast for the same ride is shown rather than
//      nothing — with its true "updated" time, so it is never passed off as fresh.
//
// The forecast never touches the server or the database.

import { isWindCacheFresh, readWindCache, type WindStorage, writeWindCache } from "./wind-cache";
import type { WindPlan, WindSample } from "./wind-model";
import { openMeteoWindProvider, type WindProvider, withinForecastHorizon } from "./wind-provider";

export interface WindForecast {
  samples: WindSample[];
  /** Epoch ms of the fetch these samples came from. */
  fetchedAt: number;
  source: "cache" | "network" | "stale-cache";
}

export interface LoadWindOptions {
  eventId: string;
  plan: WindPlan;
  nowMs?: number;
  provider?: WindProvider;
  /** Undefined = the browser's localStorage; null = no storage at all. */
  storage?: WindStorage | null;
  signal?: AbortSignal;
}

/**
 * Is there a forecast to be had for this ride right now? False once the window has closed, and
 * for a ride beyond the provider's range — both mean "show nothing, ask nothing".
 */
export function isForecastRelevant(plan: WindPlan, provider: WindProvider, nowMs: number): boolean {
  const lastMs = plan.timesMs[plan.timesMs.length - 1];
  if (nowMs > lastMs) return false;
  return withinForecastHorizon(provider, lastMs, nowMs);
}

export async function loadWindForecast(options: LoadWindOptions): Promise<WindForecast | null> {
  const { eventId, plan, nowMs = Date.now(), provider = openMeteoWindProvider, signal } = options;
  // Passed straight through: undefined falls to the cache's localStorage default, null = none.
  const { storage } = options;

  if (!isForecastRelevant(plan, provider, nowMs)) return null;

  const signature = `${provider.id}|${plan.signature}`;
  const cached = readWindCache(eventId, signature, storage);
  if (cached && isWindCacheFresh(cached, nowMs)) {
    return { samples: cached.samples, fetchedAt: cached.fetchedAt, source: "cache" };
  }

  try {
    const readings = await provider.fetchWind(
      { lat: plan.lat, lng: plan.lng },
      plan.timesMs,
      signal,
    );

    const samples: WindSample[] = [];
    plan.timesMs.forEach((timeMs, i) => {
      const reading = readings[i];
      if (!reading) return;
      samples.push({
        timeMs,
        speedKmh: reading.speedKmh,
        directionDeg: reading.directionDeg,
        gustKmh: reading.gustKmh,
        temperatureC: reading.temperatureC,
      });
    });
    if (samples.length === 0) throw new Error("no wind readings");

    const entry = { eventId, signature, fetchedAt: nowMs, samples };
    writeWindCache(entry, nowMs, storage);
    return { samples, fetchedAt: nowMs, source: "network" };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (cached) {
      return { samples: cached.samples, fetchedAt: cached.fetchedAt, source: "stale-cache" };
    }
    return null;
  }
}
