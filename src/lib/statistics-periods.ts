/**
 * Rider Statistics — the month / year timeline: types, labels, and the rules that decide what the
 * device keeps and when it asks the server again. Pure (no I/O) so those rules are unit-tested on
 * their own (statistics-periods.test.ts). The fetching lives in store/statisticsStore.ts.
 *
 * WHAT IS CACHED, AND FOR HOW LONG (asked for directly):
 *   - the CURRENT month / year   real query on the server; the device trusts it for 24 hours
 *   - a period that has ended    kept on the device with no expiry — until sign-out clears it
 *
 * The server tells the client which is which: `final` is true only once a period is over AND
 * settled (the server waits out the auto-finish window first, see statistics.periods.ts), so the
 * client never has to guess when a closed month might still change.
 *
 * THE CLIENT NEVER COMPUTES A GEM. It renders `gems[stat]` exactly as sent; thresholds live in the
 * server's statistics.gems.ts.
 */

export type Gem = "stone" | "onyx" | "emerald" | "ruby" | "diamond";
export type StatKey = "hours" | "rides" | "calories" | "distance" | "climb";
export type PeriodType = "month" | "year";

export const STAT_ORDER: StatKey[] = ["hours", "rides", "calories", "distance", "climb"];

export const STAT_LABEL: Record<StatKey, string> = {
  hours: "Hours",
  rides: "Rides",
  calories: "Calories",
  distance: "Distance",
  climb: "Climb",
};

const STAT_UNIT: Record<StatKey, string | null> = {
  hours: "h",
  rides: null,
  calories: "kcal",
  distance: "km",
  climb: "m",
};

/** One period's numbers — the same shape for the period itself and for its `previous`. */
export interface PeriodValues {
  rides: number;
  distanceKm: number;
  climbM: number;
  hours: number;
  /** null until the rider has set their weight — never an estimate from a guessed one. */
  calories: number | null;
}

export interface PeriodEntry extends PeriodValues {
  /** 'YYYY-MM' for a month, 'YYYY' for a year. */
  period: string;
  gems: Record<StatKey, Gem>;
  /** The immediately older period, for the trend arrow. */
  previous: PeriodValues;
  /** True once the period is over and settled: keep it forever. */
  final: boolean;
}

/** GET /statistics/periods */
export interface PeriodTimelinePayload {
  periodType: PeriodType;
  generatedAt: string;
  weightKg: number | null;
  /** Newest first, contiguous. */
  periods: PeriodEntry[];
}

/** What the device stores per period type. */
export interface CachedTimeline {
  periods: PeriodEntry[];
  weightKg: number | null;
}

/** How long the device trusts the CURRENT period before asking again. */
export const CURRENT_PERIOD_TTL_MS = 24 * 60 * 60 * 1000;

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

/** UTC, to match the server — a ride belongs to the UTC month it finished in. */
export function currentPeriodKey(type: PeriodType, now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  return type === "year" ? year : `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(type: PeriodType, period: string): string {
  if (type === "year") return period;
  const [year, month] = period.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
}

/**
 * Should the device ask the server at all?
 *
 * Yes when it holds nothing, when the current period is not in what it holds (a new month or year
 * started), or when what it holds for the current period is older than 24h. No otherwise — a
 * rider opening the page repeatedly costs no requests.
 */
export function needsRefresh(
  cached: { periods: readonly PeriodEntry[]; lastSyncedAt: number } | null,
  type: PeriodType,
  now: Date = new Date(),
): boolean {
  if (!cached || cached.periods.length === 0) return true;
  if (cached.periods[0].period !== currentPeriodKey(type, now)) return true;
  return now.getTime() - cached.lastSyncedAt >= CURRENT_PERIOD_TTL_MS;
}

/**
 * The oldest period the device is NOT sure of — what to send as `from` so the server returns only
 * the tail. Undefined when the device holds nothing (ask for the whole history).
 */
export function fromParamFor(
  periods: readonly PeriodEntry[] | null | undefined,
): string | undefined {
  if (!periods || periods.length === 0) return undefined;
  let oldestUnsure: string | undefined;
  for (const entry of periods) {
    if (!entry.final && (oldestUnsure === undefined || entry.period < oldestUnsure)) {
      oldestUnsure = entry.period;
    }
  }
  // Every held period is final only if the cache predates the current one — ask from the newest.
  return oldestUnsure ?? periods[0].period;
}

/** Incoming rows replace held rows of the same period; everything else is kept. Newest first. */
export function mergePeriods(
  held: readonly PeriodEntry[],
  incoming: readonly PeriodEntry[],
): PeriodEntry[] {
  const byPeriod = new Map<string, PeriodEntry>();
  for (const entry of held) byPeriod.set(entry.period, entry);
  for (const entry of incoming) byPeriod.set(entry.period, entry);
  return [...byPeriod.values()].sort((a, b) =>
    a.period < b.period ? 1 : a.period > b.period ? -1 : 0,
  );
}

/** The number for one stat of one period (or of its `previous`). */
export function statValue(values: PeriodValues, key: StatKey): number | null {
  switch (key) {
    case "hours":
      return values.hours;
    case "rides":
      return values.rides;
    case "calories":
      return values.calories;
    case "distance":
      return values.distanceKm;
    case "climb":
      return values.climbM;
  }
}

export function formatStatValue(key: StatKey, value: number | null): string {
  if (value == null) return "—";
  const formatted = value.toLocaleString("en-US");
  const unit = STAT_UNIT[key];
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Signed whole-percent change vs the prior period; null when there is no baseline (0 or
 *  unmeasured), so a rider's first ride ever does not read as "+∞%". */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const GEM_ASSET = (gem: Gem) => `/images/statistics/achievements/${gem}.jpg`;
