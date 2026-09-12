/**
 * MOCK DATA for the Rider Statistics UI — shaped close to what the real payloads will be
 * (elnino-server's feat/rider-statistics-backend branch: GET /api/v1/stats/me,
 * GET /api/v1/stats/leaderboard), extended with a few UI-only fields (earned-at dates, podium
 * ordering, rank deltas) that only exist to reproduce the approved reference designs
 * (images/statisics/menu.JPG, my statistic.JPG, achivment.JPG, board.JPG, year view.JPG,
 * all-dark mode.JPG) faithfully. See ELNINO_RIDER_STATISTICS_STATUS.md for exactly which
 * fields are "real shape" vs "UI-mock-only, needs a real source before going live."
 *
 * DELETE / REPLACE once StatisticsPage reads from a real statsStore.
 *
 * ⚠ THRESHOLD MISMATCH, NOTED ON PURPOSE: the reference images use 25/50/100/200/400 for the
 * rides tiers. The server's placeholder config (achievements.ts) currently has 10/25/50/100/250
 * — its own invented example set, written before these references existed. Reconcile the two
 * when wiring the real API; this file matches the REFERENCE IMAGES, not the current backend.
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

/** One row of the full tier roadmap (achivment.JPG's "All Achievements" list) — earned tiers
 *  carry a date, the current one is in progress, later ones are locked. */
export interface TierStatus extends AchievementTier {
  status: "earned" | "current" | "locked";
  earnedOn: string | null;
}

export interface LeaderboardRow {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  countryFlag: string;
  value: number;
  rank: number;
}

export interface SeasonGoal {
  label: string;
  current: number;
  target: number;
  unit: string;
}

export interface RiderStatsMock {
  weightKg: number | null;
  lifetime: StatTotals;
  perYear: { year: number; totals: StatTotals; goals: SeasonGoal[] }[];
  achievements: AchievementProgress[];
  achievementHistory: Record<StatCategory, TierStatus[]>;
  /** How many of the 20 total tiers (5 categories x 4 tiers each) are earned — the
   *  achivment.JPG "Your Achievements 5/10" style summary. */
  achievementsEarnedCount: number;
  achievementsTotalCount: number;
  leaderboards: Record<
    StatCategory,
    { top: LeaderboardRow[]; me: LeaderboardRow & { deltaToNextRank: string } }
  >;
}

const IL = "🇮🇱";

const RIDERS = [
  "Daniel Cohen", "Noa Kaplan", "Tomer Israeli", "Maya Levi", "Ofer Ben David",
  "Itay Shachar", "Roni Marcus", "Gal Friedman", "Yuval Katz", "Lior Bar",
];

function makeLeaderboard(
  peakValue: number,
  step: number,
  meValue: number,
  meRank: number,
  deltaToNextRank: string,
): { top: LeaderboardRow[]; me: LeaderboardRow & { deltaToNextRank: string } } {
  const top: LeaderboardRow[] = RIDERS.map((name, i) => ({
    userId: i + 1,
    displayName: name,
    avatarUrl: null,
    countryFlag: IL,
    rank: i + 1,
    value: Math.round(peakValue - i * step),
  }));

  return {
    top,
    me: {
      userId: 99,
      displayName: "Alex Rider",
      avatarUrl: null,
      countryFlag: IL,
      rank: meRank,
      value: meValue,
      deltaToNextRank,
    },
  };
}

const RIDES_TIERS: AchievementTier[] = [
  { threshold: 25, name: "Stone" },
  { threshold: 50, name: "Onyx" },
  { threshold: 100, name: "Emerald" },
  { threshold: 200, name: "Ruby" },
  { threshold: 400, name: "Diamond" },
];

export const MOCK_RIDER_STATS: RiderStatsMock = {
  weightKg: 78,
  lifetime: { ridesCount: 128, totalKm: 4820, totalClimbM: 38450, totalCalories: 142000 },
  perYear: [
    {
      year: 2026,
      totals: { ridesCount: 52, totalKm: 1840, totalClimbM: 14200, totalCalories: 72400 },
      goals: [
        { label: "1,000 km", current: 1000, target: 1000, unit: "km" },
        { label: "5,000 m climb", current: 4200, target: 5000, unit: "m" },
        { label: "50 rides", current: 52, target: 50, unit: "rides" },
      ],
    },
    {
      year: 2025,
      totals: { ridesCount: 76, totalKm: 2980, totalClimbM: 24250, totalCalories: 87800 },
      goals: [
        { label: "1,000 km", current: 1000, target: 1000, unit: "km" },
        { label: "5,000 m climb", current: 5000, target: 5000, unit: "m" },
        { label: "50 rides", current: 76, target: 50, unit: "rides" },
      ],
    },
  ],
  achievements: [
    {
      category: "rides",
      current: { threshold: 100, name: "Emerald" },
      next: { threshold: 200, name: "Ruby" },
      progressPercent: 83,
      remaining: 17,
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
  achievementHistory: {
    rides: [
      { ...RIDES_TIERS[0], status: "earned", earnedOn: "Feb 12, 2024" },
      { ...RIDES_TIERS[1], status: "earned", earnedOn: "Jun 3, 2024" },
      { ...RIDES_TIERS[2], status: "earned", earnedOn: "Nov 18, 2024" },
      { ...RIDES_TIERS[3], status: "current", earnedOn: null },
      { ...RIDES_TIERS[4], status: "locked", earnedOn: null },
    ],
    km: [
      { threshold: 1000, name: "Stone", status: "earned", earnedOn: "Mar 1, 2024" },
      { threshold: 2500, name: "Onyx", status: "earned", earnedOn: "Aug 22, 2024" },
      { threshold: 5000, name: "Emerald", status: "current", earnedOn: null },
      { threshold: 10000, name: "Ruby", status: "locked", earnedOn: null },
      { threshold: 20000, name: "Diamond", status: "locked", earnedOn: null },
    ],
    climbM: [
      { threshold: 10000, name: "Stone", status: "earned", earnedOn: "Apr 9, 2024" },
      { threshold: 25000, name: "Onyx", status: "earned", earnedOn: "Oct 4, 2024" },
      { threshold: 50000, name: "Emerald", status: "current", earnedOn: null },
      { threshold: 100000, name: "Ruby", status: "locked", earnedOn: null },
      { threshold: 200000, name: "Diamond", status: "locked", earnedOn: null },
    ],
    calories: [
      { threshold: 50000, name: "Stone", status: "earned", earnedOn: "May 15, 2024" },
      { threshold: 100000, name: "Onyx", status: "current", earnedOn: null },
      { threshold: 250000, name: "Emerald", status: "locked", earnedOn: null },
      { threshold: 500000, name: "Ruby", status: "locked", earnedOn: null },
      { threshold: 1000000, name: "Diamond", status: "locked", earnedOn: null },
    ],
  },
  achievementsEarnedCount: 7,
  achievementsTotalCount: 20,
  leaderboards: {
    rides: makeLeaderboard(842, 24, 84, 327, "74 rides to #326"),
    km: makeLeaderboard(8420, 210, 2840, 327, "74 km to #326"),
    climbM: makeLeaderboard(142000, 6200, 38450, 214, "3,100 m to #213"),
    calories: makeLeaderboard(620000, 28000, 142000, 288, "9,000 to #287"),
  },
};

export const CATEGORY_LABEL: Record<StatCategory, string> = {
  rides: "Rides",
  km: "Distance",
  climbM: "Climb",
  calories: "Calories",
};

export const LEADERBOARD_TAGLINE: Record<StatCategory, string> = {
  rides: "More Rides. Happier Days.",
  km: "Ride Further Together",
  climbM: "Every Metre Counts.",
  calories: "Burn Bright, Ride On.",
};

export function formatStatValue(category: StatCategory, value: number): string {
  switch (category) {
    case "rides":
      return value.toLocaleString("en-US");
    case "km":
      return `${value.toLocaleString("en-US")} km`;
    case "climbM":
      return `${value.toLocaleString("en-US")} m`;
    case "calories":
      return value.toLocaleString("en-US");
  }
}
