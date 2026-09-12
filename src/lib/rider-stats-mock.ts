/**
 * MOCK DATA for the Rider Statistics UI review pass — shaped exactly like the real payload
 * GET /api/v1/stats/me and GET /api/v1/stats/leaderboard will return (see
 * elnino-server/src/services/riderStats.service.ts), so wiring the real fetch later is a
 * straight swap of the import, not a rewrite of the page.
 *
 * DELETE THIS FILE once StatisticsPage.tsx reads from a real statsStore.
 */

export type StatCategory = "rides" | "km" | "climbM" | "calories";

export interface StatTotals {
  ridesCount: number;
  totalKm: number;
  totalClimbM: number;
  totalCalories: number | null;
}

export interface AchievementTier {
  threshold: number;
  name: string;
}

export interface AchievementProgress {
  category: StatCategory;
  current: AchievementTier | null;
  next: AchievementTier | null;
  progressPercent: number;
  remaining: number;
}

export interface LeaderboardRow {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  value: number;
  rank: number;
}

export interface RiderStatsMock {
  weightKg: number | null;
  lifetime: StatTotals;
  perYear: { year: number; totals: StatTotals }[];
  achievements: AchievementProgress[];
  leaderboards: Record<StatCategory, { top: LeaderboardRow[]; me: LeaderboardRow | null }>;
}

const NAMES = [
  "Alex Rider", "Dana Cohen", "Yossi Mizrahi", "Tal Barak", "Noa Shalev", "Omer Katz",
  "Maya Peretz", "Eitan Levi", "Shira Golan", "Gilad Dolev", "Roni Avraham", "Lior Ben-David",
];

function makeLeaderboard(
  category: StatCategory,
  meValue: number,
  meRank: number,
): { top: LeaderboardRow[]; me: LeaderboardRow | null } {
  const top: LeaderboardRow[] = NAMES.slice(0, 12).map((name, i) => ({
    userId: i + 1,
    displayName: name,
    avatarUrl: null,
    rank: i + 1,
    value:
      category === "rides"
        ? 340 - i * 14
        : category === "km"
          ? 18400 - i * 900
          : category === "climbM"
            ? 142000 - i * 6200
            : 620000 - i * 28000,
  }));

  // "Gilad Dolev" (userId 10) plays the signed-in viewer at a deliberately mediocre rank —
  // the whole point of this screen is proving the my-rank-outside-top-50 row actually shows.
  const me: LeaderboardRow = {
    userId: 10,
    displayName: "Gilad Dolev",
    avatarUrl: null,
    rank: meRank,
    value: meValue,
  };

  return { top, me };
}

export const MOCK_RIDER_STATS: RiderStatsMock = {
  weightKg: 78,
  lifetime: { ridesCount: 128, totalKm: 4820, totalClimbM: 38450, totalCalories: 142000 },
  perYear: [
    { year: 2026, totals: { ridesCount: 52, totalKm: 1840, totalClimbM: 14200, totalCalories: 54200 } },
    { year: 2025, totals: { ridesCount: 76, totalKm: 2980, totalClimbM: 24250, totalCalories: 87800 } },
  ],
  achievements: [
    {
      category: "rides",
      current: { threshold: 100, name: "Ruby" },
      next: { threshold: 250, name: "Diamond" },
      progressPercent: 12,
      remaining: 122,
    },
    {
      category: "km",
      current: { threshold: 2500, name: "Emerald" },
      next: { threshold: 5000, name: "Ruby" },
      progressPercent: 46,
      remaining: 180,
    },
    {
      category: "climbM",
      current: { threshold: 25000, name: "Emerald" },
      next: { threshold: 50000, name: "Ruby" },
      progressPercent: 54,
      remaining: 11550,
    },
    {
      category: "calories",
      current: { threshold: 100000, name: "Emerald" },
      next: { threshold: 250000, name: "Ruby" },
      progressPercent: 39,
      remaining: 108000,
    },
  ],
  leaderboards: {
    rides: makeLeaderboard("rides", 128, 63),
    km: makeLeaderboard("km", 4820, 71),
    climbM: makeLeaderboard("climbM", 38450, 58),
    calories: makeLeaderboard("calories", 142000, 66),
  },
};

export const CATEGORY_LABEL: Record<StatCategory, string> = {
  rides: "Rides",
  km: "KM",
  climbM: "Climb",
  calories: "Calories",
};
