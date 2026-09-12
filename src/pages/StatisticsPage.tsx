/**
 * Rider Statistics — "Me" / "Year" overview. Route: /stats.
 *
 * Reproduces images/statisics/my statistic.JPG (the "Me" tab) and .../year view.JPG (the
 * "Year" tab's Season Goals) — see ELNINO_RIDER_STATISTICS_STATUS.md for exactly which visual
 * elements from the wider reference set (menu.JPG, achivment.JPG, board.JPG, all-dark mode.JPG)
 * were deliberately left out of this pass (an XP/level meter, a "Comparisons" tab, a dedicated
 * "My Rank" deep-dive screen) as scope not yet discussed/approved, rather than an oversight.
 *
 * UI-REVIEW PASS: every number comes from MOCK_RIDER_STATS (lib/rider-stats-mock.ts), not the
 * network — see that file's header. "View All achievements" goes to /stats/achievements, the
 * trophy icon goes to /stats/leaderboard (StatisticsAchievementsPage.tsx /
 * StatisticsLeaderboardPage.tsx), both real routes, both also mock-only for now.
 *
 * Route:   /stats
 * Loads:   lib/rider-stats-mock.ts (temporary)
 * Actions: Me/Year switch; year prev/next (Year tab); links to Achievements and Leaderboard
 * State:   local UI state only — no store yet
 */

import { Bike, ChevronLeft, ChevronRight, Flame, Gem, Mountain, Ruler, Settings, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { useMyIdentity } from "../app/useMyIdentity";
import { MOCK_RIDER_STATS } from "../lib/rider-stats-mock";
import { tierColor } from "../lib/rider-stats-ui";
import shared from "./StatisticsShared.module.css";
import styles from "./StatisticsPage.module.css";

type MainTab = "me" | "year";

export function StatisticsPage() {
  const data = MOCK_RIDER_STATS;
  const me = useMyIdentity();
  const [tab, setTab] = useState<MainTab>("me");
  const [yearIndex, setYearIndex] = useState(0);

  const year = data.perYear[yearIndex];
  const hero = [...data.achievements].sort((a, b) => b.progressPercent - a.progressPercent)[0];

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

          <div className={styles.tileGrid}>
            <StatTile icon={<Bike aria-hidden="true" />} value={data.lifetime.ridesCount} label="Rides" />
            <StatTile
              icon={<Ruler aria-hidden="true" />}
              value={data.lifetime.totalKm}
              label="Kilometers"
            />
            <StatTile
              icon={<Mountain aria-hidden="true" />}
              value={data.lifetime.totalClimbM}
              label="Climb (m)"
            />
            <StatTile
              icon={<Flame aria-hidden="true" />}
              value={data.lifetime.totalCalories ?? "—"}
              label="Calories"
            />
          </div>

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
                  <div className={shared.progressTrack} style={{ marginTop: 6 }} aria-hidden="true">
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

          <Link to="/stats/leaderboard" className={`card ${styles.leaderboardLink}`}>
            <Trophy width={20} height={20} aria-hidden="true" style={{ color: "#d99206" }} />
            <span style={{ flex: 1 }}>See the Top 50 Leaderboard</span>
            <ChevronRight width={18} height={18} aria-hidden="true" />
          </Link>

          <p className={shared.quote}>"A little further each ride leads to big places."</p>
        </>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="button button--quiet"
              disabled={yearIndex === data.perYear.length - 1}
              onClick={() => setYearIndex((i) => Math.min(data.perYear.length - 1, i + 1))}
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
            <StatTile icon={<Bike aria-hidden="true" />} value={year.totals.ridesCount} label="Rides" />
            <StatTile
              icon={<Ruler aria-hidden="true" />}
              value={year.totals.totalKm}
              label="Kilometers"
            />
            <StatTile
              icon={<Mountain aria-hidden="true" />}
              value={year.totals.totalClimbM}
              label="Climb (m)"
            />
            <StatTile
              icon={<Flame aria-hidden="true" />}
              value={year.totals.totalCalories ?? "—"}
              label="Calories"
            />
          </div>

          <div className={`card ${styles.goalsCard}`}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className={styles.milestoneLabel}>Season Goals</span>
              <span className={styles.viewAll}>Edit Goals</span>
            </div>
            {year.goals.map((goal) => {
              const percent = Math.min(100, Math.round((goal.current / goal.target) * 100));
              const met = goal.current >= goal.target;
              return (
                <div key={goal.label} className={styles.goalRow}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className={styles.goalLabel}>{goal.label}</span>
                    <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                      {goal.current.toLocaleString("en-US")} / {goal.target.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <div className={shared.progressTrack} style={{ flex: 1 }} aria-hidden="true">
                      <div
                        className={shared.progressFill}
                        style={{ width: `${percent}%`, background: met ? "#10b981" : undefined }}
                      />
                    </div>
                    <span className={met ? styles.goalDone : styles.goalPercent}>
                      {met ? "✓" : `${percent}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className={shared.quote}>"Same roads. Stronger you."</p>
        </>
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
