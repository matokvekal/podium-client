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

interface StatisticsState {
  me: RiderStatsPayload | null;
  meLoading: boolean;
  meStale: boolean;
  leaderboards: Record<string, LeaderboardSlot>;

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
const leaderboardRequestIds = new Map<string, number>();

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  me: null,
  meLoading: true,
  meStale: false,
  leaderboards: {},

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

export function leaderboardSlot(scope: string) {
  return (state: StatisticsState): LeaderboardSlot =>
    state.leaderboards[scope] ?? { data: null, loading: true, stale: false };
}

export { leaderboardScopeKey };
