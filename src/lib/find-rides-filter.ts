// Client-side filtering + sorting for the "Find Rides" tab. Works ENTIRELY on the events the
// existing GET /events/public response already returns (see server toEventSummary): a summary
// carries id/name/status/type/startsAt/endsAt/location/activityType/level — and nothing else.
//
// So only these filters/sorts are possible today; the rest of the product wishlist
// (distance-from-me, ride distance, elevation gain, duration) needs fields the list API does
// not send, and is deliberately left out rather than faked:
//   - distance from me  → no event coordinates on the summary (location is free text)
//   - ride distance     → no distanceKm on a real event (route data isn't in the list)
//   - elevation gain    → no climbM on a real event
//   - duration          → no duration field anywhere, client or server
//
// No new API, no server change.

import type { EventSummary } from "./local-db";
import { LEVELS, type RiderLevel } from "./rider-level";
import type { SurfaceType } from "./surface-types";

export type DifficultyBucket = "easy" | "medium" | "hard";
export type WhenFilter = "any" | "today" | "week" | "month";
export type FindRidesSort = "soonest" | "latest" | "name" | "easiest" | "hardest";

export interface FindRidesCriteria {
  /** Matched against name + location, case-insensitive. */
  search: string;
  difficulty: DifficultyBucket[];
  surface: SurfaceType[];
  when: WhenFilter;
  sort: FindRidesSort;
}

export const DEFAULT_FIND_RIDES_CRITERIA: FindRidesCriteria = {
  search: "",
  difficulty: [],
  surface: [],
  when: "any",
  sort: "soonest",
};

/** The five rider levels collapse into the three buckets the filter offers. */
export function difficultyBucket(level: RiderLevel | null | undefined): DifficultyBucket | null {
  switch (level) {
    case "beginner":
      return "easy";
    case "intermediate":
    case "masters":
      return "medium";
    case "elite":
    case "world_tour":
      return "hard";
    default:
      return null;
  }
}

export const DIFFICULTY_LABEL: Record<DifficultyBucket, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const WHEN_LABEL: Record<Exclude<WhenFilter, "any">, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
};

export const SORT_LABEL: Record<FindRidesSort, string> = {
  soonest: "Soonest first",
  latest: "Furthest out first",
  name: "Name (A–Z)",
  easiest: "Easiest first",
  hardest: "Hardest first",
};

const LEVEL_RANK = new Map<RiderLevel, number>(LEVELS.map((l, i) => [l.value, i]));

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** `today` = starts today; `week`/`month` = starts between today and +7d / +31d. Events with
 *  no start time never match a dated filter. */
export function matchesWhen(startsAt: string | null, when: WhenFilter, now: number = Date.now()): boolean {
  if (when === "any") return true;
  const t = parseTime(startsAt);
  if (t == null) return false;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (t < startOfToday) return false;
  if (when === "today") return t < startOfToday + 86_400_000;
  if (when === "week") return t <= now + 7 * 86_400_000;
  return t <= now + 31 * 86_400_000;
}

/** How many filters (not sort) are currently narrowing the list — for the button badge. */
export function activeFilterCount(c: FindRidesCriteria): number {
  return c.difficulty.length + c.surface.length + (c.when !== "any" ? 1 : 0);
}

/** Comparator that sorts by `key` in the given direction, but always sinks rows whose key is
 *  missing to the bottom — regardless of direction. Used for both date and difficulty sorts,
 *  so "no start time" / "no level set" never wins a "furthest out" or "hardest" sort. */
function byKey<T>(key: (event: EventSummary) => T | null, dir: 1 | -1) {
  return (a: EventSummary, b: EventSummary): number => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return dir * (ka < kb ? -1 : ka > kb ? 1 : 0);
  };
}

const startTime = (e: EventSummary) => parseTime(e.startsAt);
const levelRank = (e: EventSummary) =>
  e.level != null && LEVEL_RANK.has(e.level) ? (LEVEL_RANK.get(e.level) as number) : null;

export function applyFindRidesCriteria(
  rides: EventSummary[],
  c: FindRidesCriteria,
  now: number = Date.now(),
): EventSummary[] {
  const q = c.search.trim().toLowerCase();

  const filtered = rides.filter((ride) => {
    if (
      q &&
      !ride.name.toLowerCase().includes(q) &&
      !(ride.location ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (c.difficulty.length > 0) {
      const bucket = difficultyBucket(ride.level);
      if (bucket == null || !c.difficulty.includes(bucket)) return false;
    }
    if (c.surface.length > 0) {
      if (ride.activityType == null || !c.surface.includes(ride.activityType)) return false;
    }
    if (!matchesWhen(ride.startsAt, c.when, now)) return false;
    return true;
  });

  const sorted = [...filtered];
  switch (c.sort) {
    case "soonest":
      sorted.sort(byKey(startTime, 1));
      break;
    case "latest":
      sorted.sort(byKey(startTime, -1));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "easiest":
      sorted.sort(byKey(levelRank, 1));
      break;
    case "hardest":
      sorted.sort(byKey(levelRank, -1));
      break;
  }
  return sorted;
}
