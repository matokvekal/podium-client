/**
 * MOCK DATA for the new Statistics timeline model (replaces the old tabs + 5-gem-progression-
 * rail Achievements design). Shaped close to the described future API:
 *
 *   { periodType: "month" | "year", period: "2026-08" | "2026",
 *     stats: { hours, rides, calories, distance, climb } }
 *
 * where each stat is `{ value, unit?, gem }`. THE CLIENT NEVER COMPUTES A GEM — that is
 * explicitly a server-config decision (thresholds differ per metric AND per month-vs-year).
 * This mock file plays the server's role only until that endpoint exists: every gem below is a
 * hardcoded mock value, not a client-side calculation, so swapping this file for a real fetch
 * later requires no change to how StatisticsAchievementsPage reads a period's gems.
 *
 * DELETE THIS FILE once the page reads from a real store/endpoint.
 */

export type Gem = "stone" | "onyx" | "emerald" | "ruby" | "diamond";
export type StatKey = "hours" | "rides" | "calories" | "distance" | "climb";
export type PeriodType = "month" | "year";

export interface StatMetric {
  value: number;
  unit?: string;
  gem: Gem;
}

export interface PeriodStats {
  periodType: PeriodType;
  /** "2026-08" for a month, "2026" for a year — stable id for the period, not a display label. */
  period: string;
  /** "September 2026" / "2026" — what the UI actually shows. */
  label: string;
  stats: Record<StatKey, StatMetric>;
}

export const STAT_ORDER: StatKey[] = ["hours", "rides", "calories", "distance", "climb"];

export const STAT_LABEL: Record<StatKey, string> = {
  hours: "Hours",
  rides: "Rides",
  calories: "Calories",
  distance: "Distance",
  climb: "Climb",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A small deterministic pseudo-random generator, seeded by index, so the mock is stable across
 *  re-renders instead of reshuffling every time a component mounts. */
function mockRandom(seed: number): number {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x);
}

const GEMS: Gem[] = ["stone", "onyx", "emerald", "ruby", "diamond"];
function gemForSeed(seed: number): Gem {
  return GEMS[Math.floor(mockRandom(seed) * GEMS.length)];
}

/**
 * One mock period's worth of stats. Values trend slightly lower the further back in history,
 * so the newest period at the top of the timeline doesn't look identical to the oldest.
 */
function mockPeriodStats(
  periodType: PeriodType,
  indexFromNewest: number,
  seedBase: number,
): PeriodStats["stats"] {
  const recency = Math.max(0.4, 1 - indexFromNewest * 0.05);
  const scale = periodType === "year" ? 12 : 1;

  const hours =
    Math.round((18 + mockRandom(seedBase + 1) * 20) * recency * scale) / (scale === 12 ? 1 : 1);
  const rides = Math.round((10 + mockRandom(seedBase + 2) * 25) * recency * scale);
  const calories =
    Math.round(((1500 + mockRandom(seedBase + 3) * 3500) * recency * scale) / 50) * 50;
  const distance = Math.round((80 + mockRandom(seedBase + 4) * 220) * recency * scale);
  const climb = Math.round(((1200 + mockRandom(seedBase + 5) * 3800) * recency * scale) / 50) * 50;

  return {
    hours: { value: Math.round(hours * scale), unit: "h", gem: gemForSeed(seedBase + 11) },
    rides: { value: rides, gem: gemForSeed(seedBase + 12) },
    calories: { value: calories, unit: "kcal", gem: gemForSeed(seedBase + 13) },
    distance: { value: distance, unit: "km", gem: gemForSeed(seedBase + 14) },
    climb: { value: climb, unit: "m", gem: gemForSeed(seedBase + 15) },
  };
}

/** Newest-first list of the last `count` calendar months, starting from `from` (defaults to
 *  today). Matches the timeline's "newest period at the top" requirement directly. */
export function getMonthlyPeriods(count: number, from: Date = new Date()): PeriodStats[] {
  const periods: PeriodStats[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    periods.push({
      periodType: "month",
      period,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      stats: mockPeriodStats("month", i, d.getFullYear() * 100 + d.getMonth()),
    });
  }
  return periods;
}

/** Newest-first list of the last `count` calendar years. */
export function getYearlyPeriods(count: number, from: Date = new Date()): PeriodStats[] {
  const periods: PeriodStats[] = [];
  for (let i = 0; i < count; i++) {
    const year = from.getFullYear() - i;
    periods.push({
      periodType: "year",
      period: String(year),
      label: String(year),
      stats: mockPeriodStats("year", i, year * 7),
    });
  }
  return periods;
}

export const GEM_ASSET = (gem: Gem) => `/images/statistics/achievements/${gem}.jpg`;

export function formatStatValue(stat: StatMetric): string {
  const formatted = stat.value.toLocaleString("en-US");
  return stat.unit ? `${formatted} ${stat.unit}` : formatted;
}
