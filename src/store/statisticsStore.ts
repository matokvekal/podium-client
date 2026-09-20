// Rider Statistics — real data. Same cache-first pattern as resultsStore.ts: paint from
// local-db.ts instantly (works offline, survives a slow network), then the server refreshes it
// in the background and is always the source of truth. Every row is user-scoped (see
// local-db.ts's `statistics` store), so switching accounts on the same device can never show
// one rider's private totals or rank to another.
//
// Read-only, isolated subsystem, matching the server's src/statistics/ — a failed fetch here
// never blocks navigation or any other feature; it falls back to whatever was last cached, or a
// simple "unavailable" state with nothing on screen to be wrong about.

import { create } from "zustand";
import { ApiError, apiRequest } from "../lib/api-client";
import { getCachedStatistics, putCachedStatistics } from "../lib/local-db";
import {
  type CachedTimeline,
  fromParamFor,
  mergePeriods,
  needsRefresh,
  type PeriodTimelinePayload,
  type PeriodType,
} from "../lib/statistics-periods";

export interface StatYearTotals {
  year: number;
  rides: number;
  distanceKm: number;
  climbM: number;
  hours: number;
  calories: number | null;
}

export interface AchievementTier {
  threshold: number;
  name: string;
}

export type StatCategory = "rides" | "km" | "climbM" | "calories";

export interface AchievementProgress {
  category: StatCategory;
  current: AchievementTier | null;
  next: AchievementTier | null;
  progressPercent: number;
  remaining: number;
}

export interface RiderStatsPayload {
  userId: number;
  generatedAt: string;
  weightKg: number | null;
  lifetime: StatYearTotals;
  byYear: StatYearTotals[];
  achievements: AchievementProgress[];
}

/** rides | distanceKm | climbM | hours — no calories (National Leaderboard only). */
export type LeaderboardCategory = "rides" | "distanceKm" | "climbM" | "hours";
export type LeaderboardPeriod = "lifetime" | "year";

export interface LeaderboardEntry {
  userId: number;
  displayName: string;
  /** Already resolved server-side (upload > preset > Google photo > none) — render directly. */
  avatarUrl: string | null;
  value: number;
  rank: number;
}

export interface LeaderboardPayload {
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  year: number;
  /** Empty string means "the caller has no country set" — an intentionally empty leaderboard,
   *  not a fetch failure. See statistics.service.ts's getLeaderboard. */
  country: string;
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

function leaderboardScopeKey(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  year: number | undefined,
  country: string | undefined,
): string {
  return `leaderboard:${category}:${period}:${year ?? ""}:${country ?? ""}`;
}

interface LeaderboardSlot {
  data: LeaderboardPayload | null;
  loading: boolean;
  stale: boolean;
}

interface TimelineSlot {
  data: CachedTimeline | null;
  loading: boolean;
  /** The request failed AND there is nothing cached to show instead. */
  failed: boolean;
}

interface StatisticsState {
  me: RiderStatsPayload | null;
  meLoading: boolean;
  meStale: boolean;
  leaderboards: Record<string, LeaderboardSlot>;
  /** Month / year results for the Achievements page — see lib/statistics-periods.ts. */
  timelines: Record<PeriodType, TimelineSlot>;

  loadTimeline(userId: number, type: PeriodType): Promise<void>;

  loadMyStatistics(userId: number): Promise<void>;
  loadLeaderboard(
    userId: number,
    category: LeaderboardCategory,
    period: LeaderboardPeriod,
    year?: number,
    country?: string,
  ): Promise<void>;
}

let meRequestId = 0;
const timelineRequestIds: Record<PeriodType, number> = { month: 0, year: 0 };
const EMPTY_TIMELINE: TimelineSlot = { data: null, loading: true, failed: false };
const leaderboardRequestIds = new Map<string, number>();

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  me: null,
  meLoading: true,
  meStale: false,
  leaderboards: {},
  timelines: { month: EMPTY_TIMELINE, year: EMPTY_TIMELINE },

  /**
   * Device-first, then the server only when the rules in lib/statistics-periods.ts say so:
   *   - paint whatever this device already holds, instantly (works offline)
   *   - closed months/years are kept with no expiry (until sign-out clears the cache), so they
   *     are never fetched twice; the CURRENT month/year is trusted for 24h
   *   - when a fetch is due it asks only for the tail (`from`), and merges the answer in
   */
  async loadTimeline(userId, type) {
    const thisRequest = ++timelineRequestIds[type];
    const scope = `periods:${type}`;
    const put = (slot: TimelineSlot) =>
      set((state) => ({ timelines: { ...state.timelines, [type]: slot } }));

    put({ ...get().timelines[type], loading: true, failed: false });

    const cached = await getCachedStatistics<CachedTimeline>(scope, userId);
    if (thisRequest !== timelineRequestIds[type]) return;
    if (cached) put({ data: cached.value, loading: true, failed: false });

    const heldForRule = cached
      ? { periods: cached.value.periods, lastSyncedAt: cached.lastSyncedAt }
      : null;
    if (!needsRefresh(heldForRule, type)) {
      put({ data: cached?.value ?? null, loading: false, failed: false });
      return;
    }

    try {
      const params = new URLSearchParams({ type });
      const from = fromParamFor(cached?.value.periods);
      if (from) params.set("from", from);
      const payload = await apiRequest<PeriodTimelinePayload>(`/statistics/periods?${params}`);
      if (thisRequest !== timelineRequestIds[type]) return;
      const next: CachedTimeline = {
        periods: mergePeriods(cached?.value.periods ?? [], payload.periods),
        weightKg: payload.weightKg,
      };
      await putCachedStatistics(scope, userId, next);
      if (thisRequest !== timelineRequestIds[type]) return;
      put({ data: next, loading: false, failed: false });
    } catch {
      if (thisRequest !== timelineRequestIds[type]) return;
      // What is already on screen from the device stays — a failed request is not evidence the
      // numbers are wrong. Only an empty screen is reported as a failure.
      const data = get().timelines[type].data;
      put({ data, loading: false, failed: data == null });
    }
  },

  async loadMyStatistics(userId) {
    const thisRequest = ++meRequestId;
    set({ meLoading: true });

    const cached = await getCachedStatistics<RiderStatsPayload>("me", userId);
    if (thisRequest !== meRequestId) return;
    if (cached) set({ me: cached.value, meLoading: false });

    try {
      const payload = await apiRequest<RiderStatsPayload>("/statistics/me");
      if (thisRequest !== meRequestId) return;
      await putCachedStatistics("me", userId, payload);
      if (thisRequest !== meRequestId) return;
      set({ me: payload, meLoading: false, meStale: false });
    } catch {
      if (thisRequest !== meRequestId) return;
      // Anything already on screen from the cache stays exactly as it is — a failed request is
      // not evidence the numbers are wrong, so it may not clear them.
      set({ meLoading: false, meStale: get().me != null });
    }
  },

  async loadLeaderboard(userId, category, period, year, country) {
    const scope = leaderboardScopeKey(category, period, year, country);
    const thisRequest = (leaderboardRequestIds.get(scope) ?? 0) + 1;
    leaderboardRequestIds.set(scope, thisRequest);

    set((state) => ({
      leaderboards: {
        ...state.leaderboards,
        [scope]: { data: state.leaderboards[scope]?.data ?? null, loading: true, stale: false },
      },
    }));

    const cached = await getCachedStatistics<LeaderboardPayload>(scope, userId);
    if (leaderboardRequestIds.get(scope) !== thisRequest) return;
    if (cached) {
      set((state) => ({
        leaderboards: {
          ...state.leaderboards,
          [scope]: { data: cached.value, loading: true, stale: false },
        },
      }));
    }

    try {
      const params = new URLSearchParams({ category, period });
      if (year != null) params.set("year", String(year));
      if (country) params.set("country", country);
      const payload = await apiRequest<LeaderboardPayload>(`/statistics/leaderboard?${params}`);
      if (leaderboardRequestIds.get(scope) !== thisRequest) return;
      await putCachedStatistics(scope, userId, payload);
      if (leaderboardRequestIds.get(scope) !== thisRequest) return;
      set((state) => ({
        leaderboards: {
          ...state.leaderboards,
          [scope]: { data: payload, loading: false, stale: false },
        },
      }));
    } catch (err) {
      if (leaderboardRequestIds.get(scope) !== thisRequest) return;
      const hadCache = cached != null;
      set((state) => ({
        leaderboards: {
          ...state.leaderboards,
          [scope]: {
            data: state.leaderboards[scope]?.data ?? null,
            loading: false,
            stale: hadCache || err instanceof ApiError,
          },
        },
      }));
    }
  },
}));

// A stable reference for "nothing loaded for this scope yet" — returning a fresh object
// literal here on every call (the obvious way to write this) breaks useSyncExternalStore's
// referential-equality check and React logs "The result of getSnapshot should be cached to
// avoid an infinite loop" (real risk in concurrent/strict mode, not just a warning).
const EMPTY_LEADERBOARD_SLOT: LeaderboardSlot = { data: null, loading: true, stale: false };

export function leaderboardSlot(scope: string) {
  return (state: StatisticsState): LeaderboardSlot =>
    state.leaderboards[scope] ?? EMPTY_LEADERBOARD_SLOT;
}

export { leaderboardScopeKey };
