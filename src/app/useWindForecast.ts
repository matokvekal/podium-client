// React binding for the wind pilot: turns "this ride, this viewer" into a forecast or null.
//
// When `eligible` is false this does NOTHING — no plan, no cache read, no request — which is the
// pilot's guarantee for everyone outside it. Eligibility is decided by the caller through
// lib/wind-eligibility.ts; this hook does not look at who the user is.

import { useEffect, useMemo, useState } from "react";
import { loadWindForecast, type WindForecast } from "../lib/wind-forecast";
import { planWindWindow } from "../lib/wind-model";

interface UseWindForecastInput {
  eligible: boolean;
  eventId: string | null | undefined;
  points: readonly [number, number][] | null | undefined;
  /** ISO start instant of the ride. */
  startsAt: string | null | undefined;
  /** Minutes: the organizer's figure, or the app's estimate. Null = cannot be planned. */
  durationMin: number | null | undefined;
}

export function useWindForecast({
  eligible,
  eventId,
  points,
  startsAt,
  durationMin,
}: UseWindForecastInput): WindForecast | null {
  const [forecast, setForecast] = useState<WindForecast | null>(null);

  const plan = useMemo(() => {
    if (!eligible || !points || !startsAt || durationMin == null) return null;
    const startMs = Date.parse(startsAt);
    return planWindWindow({ points, startMs, durationMin });
  }, [eligible, points, startsAt, durationMin]);

  // Keyed on the plan's signature rather than its identity: a route reload that hands back the
  // same points must not re-run this (it would only be a cache hit, but there is no reason to).
  const signature = plan?.signature ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `plan` is read through `signature`, which fully identifies it.
  useEffect(() => {
    if (!eligible || !eventId || !plan) {
      setForecast(null);
      return;
    }
    const controller = new AbortController();
    loadWindForecast({ eventId, plan, signal: controller.signal })
      .then((found) => {
        if (!controller.signal.aborted) setForecast(found);
      })
      .catch(() => {
        // Aborted, or nothing to show: the strip just stays absent.
      });
    return () => controller.abort();
  }, [eligible, eventId, signature]);

  return forecast;
}
