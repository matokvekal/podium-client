/**
 * National Leaderboard — mock data only, no network. Source of truth for the shape and the
 * numbers is the supplied reference package (statisics/board/mockLeaderboard.ts,
 * ELNINO_PROJECT_SOURCE_OF_TRUTH context: "elnino-national-leaderboard-mock.zip"); this is a
 * near-literal port of it into this app's lib/ layer so StatisticsLeaderboardPage.tsx can
 * import it the same way every other page imports its own mock.
 *
 * Exactly four ranking dimensions, in this order — Rides, Distance, Climb, Hours. No Calories:
 * this screen is rider-vs-rider (a national championship), not the personal me-vs-myself
 * history the rest of Statistics covers, and calories stay on that personal screen only. Hours
 * is accumulated riding/activity duration, not elapsed calendar time.
 *
 * UI-only. Swapping this for a real GET /leaderboard is a separate pass — see
 * StatisticsLeaderboardPage.tsx's own header.
 */

export type LeaderboardMetric = "rides" | "climb" | "distance" | "hours";

const ICON_BASE = "/images/statistics/leaderboard";

export const metricMeta: Record<
  LeaderboardMetric,
  { label: string; unit: string; icon: string }
> = {
  rides: { label: "Rides", unit: "rides", icon: `${ICON_BASE}/rides.svg` },
  climb: { label: "Climb", unit: "m", icon: `${ICON_BASE}/climb.svg` },
  distance: { label: "Distance", unit: "km", icon: `${ICON_BASE}/distance.svg` },
  hours: { label: "Hours", unit: "h", icon: `${ICON_BASE}/hours.svg` },
};

export interface LeaderboardRow {
  rank: number;
  id: string;
  name: string;
  country: string;
  value: number;
  unit: string;
  avatar?: string;
}

const NAMES = [
  "Daniel Cohen",
  "Noa Kaplan",
  "Tomer Israeli",
  "Maya Levi",
  "Ofer Ben David",
  "Itay Shachar",
  "Roni Marcus",
  "Gal Friedman",
  "Yuval Katz",
  "Lior Bar",
  "Shira Azulay",
  "Amit Tal",
  "Nadav Raz",
  "Dana Mor",
  "Eyal Chen",
  "Yael Stern",
  "Avi Romano",
  "Rotem Shalev",
  "Nir Dagan",
  "Michal Ben Ami",
];

function valueFor(metric: LeaderboardMetric, rank: number): number {
  if (metric === "rides") return Math.max(4, Math.round(150 - rank * 0.42));
  if (metric === "climb") return Math.max(800, Math.round(92000 - rank * 255));
  if (metric === "distance") return Math.max(450, Math.round(8700 - rank * 22.7));
  // Accumulated riding time, one decimal place (e.g. "82.5 h") — matches how a real duration
  // total would actually read, not a whole-number placeholder.
  return Math.max(12, Math.round((510 - rank * 1.45) * 10) / 10);
}

/** Rank of the mocked "current rider" — kept away from the podium on purpose (the whole point
 * of the "Where am I?" button and the pinned/highlighted row is proving they work far down a
 * long list, not at the top of it). */
export const CURRENT_RIDER_RANK = 237;
export const CURRENT_RIDER_ID = `rider-${CURRENT_RIDER_RANK}`;

const TOP_ROW_COUNT = 300;

export function makeNationalLeaderboard(metric: LeaderboardMetric): LeaderboardRow[] {
  const unit = metricMeta[metric].unit;
  return Array.from({ length: TOP_ROW_COUNT }, (_, i) => {
    const rank = i + 1;
    const name =
      rank === CURRENT_RIDER_RANK
        ? "Alex Rider"
        : NAMES[i % NAMES.length] +
          (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : "");
    return {
      rank,
      id: `rider-${rank}`,
      name,
      country: "IL",
      value: valueFor(metric, rank),
      unit,
      avatar:
        rank === 1
          ? `${ICON_BASE}/daniel.svg`
          : rank === 2
            ? `${ICON_BASE}/noa.svg`
            : rank === 3
              ? `${ICON_BASE}/tomer.svg`
              : rank === CURRENT_RIDER_RANK
                ? `${ICON_BASE}/alex.svg`
                : undefined,
    };
  });
}
