// React binding for route weather: turns "this ride, this viewer" into a small set of
// along-the-route forecasts, or null when the route is short enough that one point already
// covers it (see WindStrip/useWindForecast for that single-point case).
//
// Refresh policy (asked for directly, kept deliberately narrow):
//   - the cache (if any) is shown immediately, however old, with no request;
//   - the ONE automatic refresh happens only when today is the ride's own calendar day AND the
//     cache is missing or older than the 5 h TTL;
//   - before the ride day, nothing auto-refreshes — cache or nothing;
//   - `refresh()` is the manual escape hatch and always fetches, any day, any cache age.
// Any failure — no route, no start time, a blocked/full localStorage, a failed request — just
// leaves the section showing whatever it already had (or nothing), never an error that reaches
// the rest of the page.

import { useEffect, useMemo, useRef, useState } from "react";
import { planRouteWeather, type RouteWeatherPlan } from "../lib/route-weather";
import {
  ROUTE_WEATHER_CACHE_TTL_MS,
  readRouteWeatherCache,
  writeRouteWeatherCache,
} from "../lib/route-weather-cache";
import { fetchRouteWeather, type RouteWeatherReading } from "../lib/route-weather-provider";
import { isSameLocalDay } from "../lib/time";

interface UseRouteWeatherInput {
  eventId: string | null | undefined;
  userId: number | string | null | undefined;
  points: readonly [number, number][] | null | undefined;
  /** ISO start instant of the ride. */
  startsAt: string | null | undefined;
  /** Minutes: the organizer's figure, or the app's estimate. */
  durationMin: number | null | undefined;
}

export interface RouteWeatherState {
  samples: RouteWeatherReading[] | null;
  /** Epoch ms of the samples currently shown — null when there is nothing cached or fetched yet. */
  generatedAt: number | null;
  status: "idle" | "loading" | "error";
  refresh: () => void;
}

export function useRouteWeather({
  eventId,
  userId,
  points,
  startsAt,
  durationMin,
}: UseRouteWeatherInput): RouteWeatherState | null {
  const [samples, setSamples] = useState<RouteWeatherReading[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const plan = useMemo(() => {
    if (!points || startsAt == null || durationMin == null) return null;
    const startMs = Date.parse(startsAt);
    return planRouteWeather({ points, startMs, durationMin });
  }, [points, startsAt, durationMin]);

  const signature = plan?.signature ?? null;
  const userKey = userId == null ? "guest" : String(userId);

  // Guards one automatic refresh per (user, event, plan) — a manual refresh() is unaffected.
  const autoRefreshedRef = useRef<string | null>(null);
  // The in-flight request's controller, aborted on unmount — covers both the automatic refresh
  // and a manual refresh() the rider triggered just before navigating away.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `plan`/`points` read through `signature`, which fully identifies them.
  useEffect(() => {
    if (!eventId || !plan) {
      setSamples(null);
      setGeneratedAt(null);
      setStatus("idle");
      return;
    }

    const cached = readRouteWeatherCache(userKey, eventId, plan.signature);
    if (cached) {
      setSamples(cached.samples);
      setGeneratedAt(cached.generatedAt);
    } else {
      setSamples(null);
      setGeneratedAt(null);
    }
    setStatus("idle");

    const nowMs = Date.now();
    const isRideMorning = isSameLocalDay(startsAt, new Date(nowMs));
    const cacheIsStale = !cached || nowMs - cached.generatedAt >= ROUTE_WEATHER_CACHE_TTL_MS;
    const alreadyAutoRefreshed = autoRefreshedRef.current === plan.signature;

    if (isRideMorning && cacheIsStale && !alreadyAutoRefreshed) {
      autoRefreshedRef.current = plan.signature;
      const controller = new AbortController();
      abortRef.current = controller;
      void runFetch(
        plan,
        eventId,
        userKey,
        controller.signal,
        setSamples,
        setGeneratedAt,
        setStatus,
      );
    }
  }, [eventId, userKey, signature]);

  const refresh = () => {
    if (!eventId || !plan) return;
    const controller = new AbortController();
    abortRef.current = controller;
    void runFetch(plan, eventId, userKey, controller.signal, setSamples, setGeneratedAt, setStatus);
  };

  if (!plan) return null;
  return { samples, generatedAt, status, refresh };
}

async function runFetch(
  plan: RouteWeatherPlan,
  eventId: string,
  userKey: string,
  signal: AbortSignal,
  setSamples: (v: RouteWeatherReading[] | null) => void,
  setGeneratedAt: (v: number | null) => void,
  setStatus: (v: "idle" | "loading" | "error") => void,
) {
  setStatus("loading");
  try {
    const result = await fetchRouteWeather(plan, signal);
    if (signal.aborted) return;
    const generatedAt = Date.now();
    setSamples(result);
    setGeneratedAt(generatedAt);
    setStatus("idle");
    writeRouteWeatherCache({
      userId: userKey,
      eventId,
      signature: plan.signature,
      generatedAt,
      samples: result,
    });
  } catch {
    if (signal.aborted) return;
    // Keep whatever was already on screen (cache or a previous fetch); only show the small
    // inline error when there is truly nothing to fall back on.
    const cached = readRouteWeatherCache(userKey, eventId, plan.signature);
    if (cached) {
      setSamples(cached.samples);
      setGeneratedAt(cached.generatedAt);
      setStatus("idle");
    } else {
      setStatus("error");
    }
  }
}
