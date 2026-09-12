/**
 * Rider Statistics — a gamified "this is my progress" screen, not a BI dashboard. Route: /stats.
 *
 * UI-REVIEW PASS: every number on this page comes from MOCK_RIDER_STATS
 * (lib/rider-stats-mock.ts), not the network. The real endpoints
 * (GET /api/v1/stats/me, GET /api/v1/stats/leaderboard) already exist server-side
 * (riderStats.service.ts) — this page swaps to a real statsStore once the UI itself is
 * approved, per the explicit "don't wire the API yet" instruction this was built under.
 *
 * Loads:    lib/rider-stats-mock.ts (temporary)
 * Actions:  Lifetime/Year switch; leaderboard category switch
 * State:    two bits of local UI state (which scope, which leaderboard category) — no store yet
 */

import { Bike, ChevronRight, Flame, Gem, Mountain, Ruler, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  MOCK_RIDER_STATS,
  type StatCategory,
  type StatTotals,
} from "../lib/rider-stats-mock";
import styles from "./StatisticsPage.module.css";

const CATEGORY_ORDER: StatCategory[] = ["rides", "km", "climbM", "calories"];

/** Tier name -> the gem colour it should read as. Cosmetic only; the achievement names
 *  themselves are configurable server-side (achievements.ts) and may not match these exact
 *  five forever — this just needs SOME colour for whatever name comes back. */
const TIER_COLOR: Record<string, string> = {
  Stone: "#94a3b8",
  Onyx: "#475569",
  Emerald: "#10b981",
  Ruby: "#e11d48",
  Diamond: "#38bdf8",
};

function tierColor(name: string | undefined): string {
  return (name && TIER_COLOR[name]) || "var(--accent-strong)";
}

function formatValue(category: StatCategory, value: number): string {
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

export function StatisticsPage() {
  const data = MOCK_RIDER_STATS;
  const scopes = useMemo(
    () => ["lifetime" as const, ...data.perYear.map((y) => y.year)],
    [data.perYear],
  );
  const [scope, setScope] = useState<"lifetime" | number>("lifetime");
  const [leaderboardCategory, setLeaderboardCategory] = useState<StatCategory>("km");

  const totals: StatTotals =
    scope === "lifetime" ? data.lifetime : data.perYear.find((y) => y.year === scope)!.totals;

  // The hero achievement is whichever category is closest to its next tier — the strongest
  // "almost there!" moment on the page. The other three still show, just smaller.
  const sortedAchievements = [...data.achievements].sort(
    (a, b) => b.progressPercent - a.progressPercent,
  );
  const [hero, ...rest] = sortedAchievements;

  const board = data.leaderboards[leaderboardCategory];
  const myRankIsVisible = board.me != null && board.top.some((r) => r.userId === board.me?.userId);

  return (
    <div className={`stack ${styles.page}`}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>MY RIDING</p>
        <div className={styles.scopeTabs} role="tablist" aria-label="Statistics period">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "lifetime"}
            className={scope === "lifetime" ? styles.scopeTabActive : styles.scopeTab}
            onClick={() => setScope("lifetime")}
          >
            Lifetime
          </button>
          {scopes
            .filter((s): s is number => s !== "lifetime")
            .map((year) => (
              <button
                key={year}
                type="button"
                role="tab"
                aria-selected={scope === year}
                className={scope === year ? styles.scopeTabActive : styles.scopeTab}
                onClick={() => setScope(year)}
              >
                {year}
              </button>
            ))}
        </div>

        <div className={styles.tileGrid}>
          <div className={styles.tile}>
            <Bike className={styles.tileIcon} aria-hidden="true" />
            <div className={styles.tileValue}>{totals.ridesCount.toLocaleString("en-US")}</div>
            <div className={styles.tileLabel}>Rides</div>
          </div>
          <div className={styles.tile}>
            <Ruler className={styles.tileIcon} aria-hidden="true" />
            <div className={styles.tileValue}>{totals.totalKm.toLocaleString("en-US")}</div>
            <div className={styles.tileLabel}>Kilometers</div>
          </div>
          <div className={styles.tile}>
            <Mountain className={styles.tileIcon} aria-hidden="true" />
            <div className={styles.tileValue}>{totals.totalClimbM.toLocaleString("en-US")}</div>
            <div className={styles.tileLabel}>Climb (m)</div>
          </div>
          <div className={styles.tile}>
            <Flame className={styles.tileIcon} aria-hidden="true" />
            <div className={styles.tileValue}>
              {totals.totalCalories == null ? "—" : totals.totalCalories.toLocaleString("en-US")}
            </div>
            <div className={styles.tileLabel}>Calories</div>
          </div>
        </div>
      </div>

      {/* ACHIEVEMENTS — the game, not the report. One hero card for whatever category is
          closest to its next tier, then the rest as compact rows so all four are always
          visible without a tab. */}
      <section className={`card ${styles.achievementHero}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className={styles.sectionEyebrow}>NEXT ACHIEVEMENT</p>
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {CATEGORY_LABEL[hero.category]}
          </span>
        </div>
        <div className={styles.heroGemRow}>
          <Gem
            className={styles.heroGem}
            style={{ color: tierColor(hero.next?.name) }}
            aria-hidden="true"
          />
          <div>
            <div className={styles.heroGemName}>{hero.next?.name ?? "All tiers unlocked"}</div>
            {hero.next && (
              <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                {formatValue(hero.category, hero.next.threshold - hero.remaining)} /{" "}
                {formatValue(hero.category, hero.next.threshold)}
              </div>
            )}
          </div>
        </div>
        {hero.next && (
          <>
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${hero.progressPercent}%` }} />
            </div>
            <p className={styles.progressCaption}>
              {hero.progressPercent}% — {formatValue(hero.category, hero.remaining)} to unlock{" "}
              {hero.next.name}!
            </p>
          </>
        )}
      </section>

      <section className={styles.achievementRows}>
        {rest.map((achievement) => (
          <div key={achievement.category} className={`card ${styles.achievementRow}`}>
            <Gem
              className={styles.rowGem}
              style={{ color: tierColor(achievement.current?.name ?? achievement.next?.name) }}
              aria-hidden="true"
            />
            <div className={styles.achievementRowBody}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className={styles.rowLabel}>{CATEGORY_LABEL[achievement.category]}</span>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {achievement.current?.name ?? "Unranked"}
                  {achievement.next ? ` → ${achievement.next.name}` : ""}
                </span>
              </div>
              <div className={styles.progressTrackSmall} aria-hidden="true">
                <div
                  className={styles.progressFillSmall}
                  style={{ width: `${achievement.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* LEADERBOARD */}
      <section className={`card ${styles.leaderboard}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className={styles.sectionEyebrow}>
            <Trophy className={styles.trophyIcon} aria-hidden="true" /> TOP 50 RIDERS
          </p>
        </div>
        <div className={styles.categoryTabs} role="tablist" aria-label="Leaderboard category">
          {CATEGORY_ORDER.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={leaderboardCategory === category}
              className={
                leaderboardCategory === category ? styles.categoryTabActive : styles.categoryTab
              }
              onClick={() => setLeaderboardCategory(category)}
            >
              {CATEGORY_LABEL[category]}
            </button>
          ))}
        </div>

        <ol className={styles.leaderboardList}>
          {board.top.map((row) => (
            <li
              key={row.userId}
              className={
                row.userId === board.me?.userId
                  ? `${styles.leaderboardRow} ${styles.leaderboardRowMe}`
                  : styles.leaderboardRow
              }
            >
              <span className={styles.rank}>{row.rank}</span>
              <span className={styles.leaderboardName}>{row.displayName}</span>
              <span className={styles.leaderboardValue}>
                {formatValue(leaderboardCategory, row.value)}
              </span>
            </li>
          ))}

          {!myRankIsVisible && board.me && (
            <>
              <li className={styles.leaderboardEllipsis} aria-hidden="true">
                <ChevronRight className={styles.ellipsisIcon} aria-hidden="true" />
              </li>
              <li className={`${styles.leaderboardRow} ${styles.leaderboardRowMe}`}>
                <span className={styles.rank}>{board.me.rank}</span>
                <span className={styles.leaderboardName}>{board.me.displayName}</span>
                <span className={styles.leaderboardValue}>
                  {formatValue(leaderboardCategory, board.me.value)}
                </span>
              </li>
            </>
          )}
        </ol>
      </section>

      <p className={styles.quote}>"A little further each ride leads to big places."</p>
    </div>
  );
}
