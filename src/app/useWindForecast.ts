// React binding for the wind pilot: turns "this ride, this viewer" into a forecast or null.
//
// With no route, start time or duration there is nothing to plan, and it does NOTHING — no cache
// read, no request. Any failure on the way just leaves the forecast null.

import { useEffect, useMemo, useState } from "react";
import { loadWindForecast, type WindForecast } from "../lib/wind-forecast";
import { planWindWindow } from "../lib/wind-model";

interface UseWindForecastInput {
  eventId: string | null | undefined;
  points: readonly [number, number][] | null | undefined;
  /** ISO start instant of the ride. */
  startsAt: string | null | undefined;
  /** Minutes: the organizer's figure, or the app's estimate. Null = cannot be planned. */
  durationMin: number | null | undefined;
}

export function useWindForecast({
  eventId,
  points,
  startsAt,
  durationMin,
}: UseWindForecastInput): WindForecast | null {
  const [forecast, setForecast] = useState<WindForecast | null>(null);

  const plan = useMemo(() => {
    if (!points || !startsAt || durationMin == null) return null;
    const startMs = Date.parse(startsAt);
    return planWindWindow({ points, startMs, durationMin });
  }, [points, startsAt, durationMin]);

  // Keyed on the plan's signature rather than its identity: a route reload that hands back the
  // same points must not re-run this (it would only be a cache hit, but there is no reason to).
  const signature = plan?.signature ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `plan` is read through `signature`, which fully identifies it.
  useEffect(() => {
    if (!eventId || !plan) {
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
  }, [eventId, signature]);

  return forecast;
}
