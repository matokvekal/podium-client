/**
 * Rider Statistics — "Me" / "Year" overview. Route: /stats.
 *
 * REAL DATA: reads useStatisticsStore (GET /api/v1/statistics/me), cache-first via
 * local-db.ts — see statisticsStore.ts's own header. Reproduces images/statisics/my statistic.JPG
 * (the "Me" tab) and .../year view.JPG (the "Year" tab's stat tiles) — see
 * ELNINO_RIDER_STATISTICS_STATUS.md for exactly which visual elements from the wider reference
 * set were deliberately left out (an XP/level meter, a "Comparisons" tab, a dedicated "My Rank"
 * deep-dive screen) as scope not yet discussed/approved, rather than an oversight.
 *
 * SEASON GOALS (year view.JPG's target-vs-current cards) ARE NOT SHOWN. There is no real
 * source for a "target" number anywhere in the schema — a goal is something a rider would have
 * to set, and no such feature exists yet. Showing an invented target next to a rider's real
 * totals would be exactly the "no invented numbers" rule this codebase states everywhere else
 * (sql/022, sql/034). Bring the card back once Season Goals is a real, designed feature.
 *
 * Route:   /stats
 * Loads:   store/statisticsStore.ts -> GET /api/v1/statistics/me
 * Actions: Me/Year switch; year prev/next (Year tab); links to Achievements and Leaderboard
 */

import {
  Bike,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gem,
  Mountain,
  RefreshCw,
  Ruler,
  Settings,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { useMyIdentity } from "../app/useMyIdentity";
import { MOCK_RIDER_STATS, type StatTotals } from "../lib/rider-stats-mock";
import { tierColor } from "../lib/rider-stats-ui";
import type { RiderStatsPayload, StatYearTotals } from "../store/statisticsStore";
import { useStatisticsStore } from "../store/statisticsStore";
import { MockDataNotice } from "./MockDataBadge";
import styles from "./StatisticsPage.module.css";
import shared from "./StatisticsShared.module.css";

type MainTab = "me" | "year";

/** MOCK_RIDER_STATS predates the real store's field names (ridesCount/totalKm/totalClimbM,
 *  no hours) — mapped here rather than changed at the source, since StatisticsYearPage.tsx
 *  still reads the original shape directly. `hours` has no mock equivalent to carry over, so
 *  it is estimated from distance at a plausible average speed — fine for a value that is
 *  already, visibly, sample data (see MockDataBadge.tsx), never done for a real number. */
function toMockYearStats(year: number, totals: StatTotals): StatYearTotals {
  return {
    year,
    rides: totals.ridesCount,
    distanceKm: totals.totalKm,
    climbM: totals.totalClimbM,
    hours: Math.round((totals.totalKm / 22) * 10) / 10,
    calories: totals.totalCalories,
  };
}

const MOCK_PAYLOAD: RiderStatsPayload = {
  userId: 0,
  generatedAt: new Date().toISOString(),
  weightKg: MOCK_RIDER_STATS.weightKg,
  lifetime: toMockYearStats(0, MOCK_RIDER_STATS.lifetime),
  byYear: MOCK_RIDER_STATS.perYear.map((y) => toMockYearStats(y.year, y.totals)),
  achievements: MOCK_RIDER_STATS.achievements,
};

export function StatisticsPage() {
  const me = useMyIdentity();
  const real = useStatisticsStore((s) => s.me);
  const loading = useStatisticsStore((s) => s.meLoading);
  const loadMyStatistics = useStatisticsStore((s) => s.loadMyStatistics);
  const [tab, setTab] = useState<MainTab>("me");
  const [yearIndex, setYearIndex] = useState(0);

  useEffect(() => {
    if (me.userId != null) void loadMyStatistics(me.userId);
  }, [me.userId, loadMyStatistics]);

  // While the real fetch has never once succeeded (not "genuinely zero rides" — that has its
  // own honest welcome card below — but the request itself failing, e.g. the backend
  // migrations not being live anywhere yet), show what this page looks like with sample data
  // rather than a bare "unavailable" card. Delete once GET /statistics/me can answer for real.
  const usingMock = !loading && !real;
  const data = real ?? (usingMock ? MOCK_PAYLOAD : null);

  const year = data?.byYear[yearIndex];
  const hero = data
    ? [...data.achievements].sort((a, b) => b.progressPercent - a.progressPercent)[0]
    : null;

  if (!data) {
    return (
      <div className="stack">
        <div className={shared.hero}>
          <div className={shared.heroTopRow}>
            <h1 className={shared.heroTitle}>Statistics</h1>
          </div>
          <p className={shared.heroSubtitle}>Ride. Explore. Progress.</p>
        </div>
        <div className={shared.emptyState}>
          <span className={`${shared.emptyIcon} ${shared.emptyIconMuted}`}>
            <RefreshCw aria-hidden="true" />
          </span>
          <p className={shared.emptyTitle}>Loading your statistics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className={shared.hero}>
        <div className={shared.heroTopRow}>
          <h1 className={shared.heroTitle}>Statistics</h1>
          <button type="button" className={shared.heroIconBtn} aria-label="Settings">
            <Settings width={17} height={17} aria-hidden="true" />
          </button>
        </div>
        <p className={shared.heroSubtitle}>Ride. Explore. Progress.</p>
      </div>

      {usingMock && (
        <MockDataNotice>
          Sample numbers — we couldn't load your real statistics.{" "}
          <button
            type="button"
            onClick={() => me.userId != null && void loadMyStatistics(me.userId)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent-strong)",
              font: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Try again
          </button>
        </MockDataNotice>
      )}

      <div className={shared.tabs} role="tablist" aria-label="Statistics view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "me"}
          className={tab === "me" ? shared.tabActive : shared.tab}
          onClick={() => setTab("me")}
        >
          Me
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "year"}
          className={tab === "year" ? shared.tabActive : shared.tab}
          onClick={() => setTab("year")}
        >
          Year
        </button>
      </div>

      {tab === "me" ? (
        <>
          <div className={`card ${styles.profileRow}`}>
            <Avatar
              className={styles.profileAvatar}
              name={me.displayName}
              avatarUrl={me.avatarUrl}
              identity={me.avatar}
              localSelection={me.localAvatar}
              seed={me.seed}
            />
            <div>
              <div className={styles.profileName}>{me.displayName}</div>
              <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Lifetime rider
              </div>
            </div>
          </div>

          {data.lifetime.rides === 0 && (
            <div className={`card ${shared.emptyState}`}>
              <span className={shared.emptyIcon}>
                <Sparkles aria-hidden="true" />
              </span>
              <p className={shared.emptyTitle}>Your cycling story starts here</p>
              <p className={shared.emptyBody}>
                Finish your first ride and every number below fills in — rides, kilometers, climb,
                calories, and your first milestone.
              </p>
              <Link to="/" className="button">
                Find a ride
              </Link>
            </div>
          )}

          <div className={styles.tileGrid}>
            <StatTile
              icon={<Bike aria-hidden="true" />}
              value={data.lifetime.rides}
              label="Rides"
            />
            <StatTile
              icon={<Ruler aria-hidden="true" />}
              value={data.lifetime.distanceKm}
              label="Kilometers"
            />
            <StatTile
              icon={<Mountain aria-hidden="true" />}
              value={data.lifetime.climbM}
              label="Climb (m)"
            />
            <StatTile
              icon={<Flame aria-hidden="true" />}
              value={data.lifetime.calories ?? "—"}
              label="Calories"
            />
          </div>

          {hero && (
            <Link to="/stats/achievements" className={`card ${styles.milestoneCard}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className={styles.milestoneLabel}>Next Milestone</span>
                <span className={styles.viewAll}>View All ›</span>
              </div>
              <div className={styles.milestoneBody}>
                <Gem
                  className={shared.gemLg}
                  style={{ color: tierColor(hero.next?.name) }}
                  aria-hidden="true"
                />
                <div style={{ flex: 1 }}>
                  <div className={styles.milestoneGemName}>{hero.next?.name ?? "All unlocked"}</div>
                  {hero.next && <div className="muted">{hero.next.threshold} rides</div>}
                  {hero.next && (
                    <div
                      className={shared.progressTrack}
                      style={{ marginTop: 6 }}
                      aria-hidden="true"
                    >
                      <div
                        className={shared.progressFill}
                        style={{ width: `${hero.progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              {hero.next && (
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                  {hero.next.threshold - hero.remaining} / {hero.next.threshold} rides —{" "}
                  {hero.remaining} remaining
                </p>
              )}
            </Link>
          )}

          <Link to="/stats/leaderboard" className={`card ${styles.leaderboardLink}`}>
            <Trophy width={20} height={20} aria-hidden="true" style={{ color: "#d99206" }} />
            <span style={{ flex: 1 }}>See the National Leaderboard</span>
            <ChevronRight width={18} height={18} aria-hidden="true" />
          </Link>

          <p className={shared.quote}>"A little further each ride leads to big places."</p>
        </>
      ) : data.byYear.length === 0 ? (
        <div className={`card ${shared.emptyState}`}>
          <span className={shared.emptyIcon}>
            <Sparkles aria-hidden="true" />
          </span>
          <p className={shared.emptyTitle}>No season yet</p>
          <p className={shared.emptyBody}>
            Your yearly breakdown — rides, kilometers, climb — appears here the moment you finish
            your first ride of the year.
          </p>
          <Link to="/" className="button">
            Find a ride
          </Link>
        </div>
      ) : (
        year && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="button button--quiet"
                disabled={yearIndex === data.byYear.length - 1}
                onClick={() => setYearIndex((i) => Math.min(data.byYear.length - 1, i + 1))}
                aria-label="Previous year"
              >
                <ChevronLeft width={16} height={16} aria-hidden="true" />
              </button>
              <h2 style={{ margin: 0 }}>{year.year} Season</h2>
              <button
                type="button"
                className="button button--quiet"
                disabled={yearIndex === 0}
                onClick={() => setYearIndex((i) => Math.max(0, i - 1))}
                aria-label="Next year"
              >
                <ChevronRight width={16} height={16} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.tileGrid}>
              <StatTile icon={<Bike aria-hidden="true" />} value={year.rides} label="Rides" />
              <StatTile
                icon={<Ruler aria-hidden="true" />}
                value={year.distanceKm}
                label="Kilometers"
              />
              <StatTile
                icon={<Mountain aria-hidden="true" />}
                value={year.climbM}
                label="Climb (m)"
              />
              <StatTile
                icon={<Flame aria-hidden="true" />}
                value={year.calories ?? "—"}
                label="Calories"
              />
            </div>

            <p className={shared.quote}>"Same roads. Stronger you."</p>
          </>
        )
      )}
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileIcon}>{icon}</span>
      <div className={styles.tileValue}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </div>
      <div className={styles.tileLabel}>{label}</div>
    </div>
  );
}
