/**
 * Rider Statistics — Leaderboard. Route: /stats/leaderboard.
 *
 * Reproduces images/statisics/board.JPG: category tabs, a Lifetime/Year scope switch, a
 * podium for the top 3 (crown on #1), a ranked list for #4+, and a pinned "my rank" row that
 * always shows — the specifically-requested behaviour — even when far outside the visible
 * list. See StatisticsPage.tsx's header for what from the wider reference set was left out of
 * this pass (a dedicated "My Rank" deep-dive screen).
 *
 * UI-REVIEW PASS: reads MOCK_RIDER_STATS — see lib/rider-stats-mock.ts's header. The real
 * leaderboard is capped at Top 50 server-side (riderStats.queries.ts); this mock only carries
 * 10 rows, enough to prove the podium + list + pinned-row layout.
 *
 * Route:   /stats/leaderboard
 * Loads:   lib/rider-stats-mock.ts (temporary)
 * Actions: category switch; Lifetime/Year switch; back to /stats
 */

import { ChevronLeft, Crown, Trophy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import {
  CATEGORY_LABEL,
  formatStatValue,
  LEADERBOARD_TAGLINE,
  MOCK_RIDER_STATS,
  type StatCategory,
} from "../lib/rider-stats-mock";
import styles from "./StatisticsLeaderboardPage.module.css";
import shared from "./StatisticsShared.module.css";

const CATEGORY_ORDER: StatCategory[] = ["rides", "km", "climbM", "calories"];
const PODIUM_ORDER = [1, 0, 2]; // silver, gold, bronze left-to-right, gold tallest/centre

export function StatisticsLeaderboardPage() {
  const data = MOCK_RIDER_STATS;
  const [category, setCategory] = useState<StatCategory>("rides");
  const [scope, setScope] = useState<"lifetime" | number>(data.perYear[0].year);

  const board = data.leaderboards[category];
  const podium = board.top.slice(0, 3);
  const rest = board.top.slice(3);

  return (
    <div className="stack">
      <div className={shared.plainHeader}>
        <Link to="/stats" className={shared.plainHeaderBack} aria-label="Back to Statistics">
          <ChevronLeft width={18} height={18} aria-hidden="true" />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 className={shared.plainHeaderTitle}>Leaderboard</h1>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            {LEADERBOARD_TAGLINE[category]}
          </p>
        </div>
        <Trophy width={22} height={22} aria-hidden="true" style={{ color: "#d99206" }} />
      </div>

      <div className={shared.tabs} role="tablist" aria-label="Leaderboard category">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={category === c ? shared.tabActive : shared.tab}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className={shared.tabs} role="tablist" aria-label="Leaderboard period">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "lifetime"}
          className={scope === "lifetime" ? shared.tabActive : shared.tab}
          onClick={() => setScope("lifetime")}
        >
          Lifetime
        </button>
        {data.perYear.map((y) => (
          <button
            key={y.year}
            type="button"
            role="tab"
            aria-selected={scope === y.year}
            className={scope === y.year ? shared.tabActive : shared.tab}
            onClick={() => setScope(y.year)}
          >
            {y.year}
          </button>
        ))}
      </div>

      <div className={styles.podium}>
        {PODIUM_ORDER.map((i) => {
          const row = podium[i];
          if (!row) return <div key={i} />;
          const place = i + 1;
          return (
            <div key={row.userId} className={styles.podiumSpot} data-place={place}>
              {place === 1 && (
                <Crown width={22} height={22} aria-hidden="true" className={styles.crown} />
              )}
              <Avatar
                name={row.displayName}
                avatarUrl={row.avatarUrl}
                className={styles.podiumAvatar}
              />
              <span className={styles.podiumRank} data-place={place}>
                {place}
              </span>
              <span className={styles.podiumName}>{row.displayName}</span>
              <span className={styles.podiumValue}>{formatStatValue(category, row.value)}</span>
            </div>
          );
        })}
      </div>

      <div className={`card ${styles.listCard}`}>
        <div className={styles.listHeader}>
          <span>#</span>
          <span style={{ flex: 1 }}>Rider</span>
          <span>{CATEGORY_LABEL[category]}</span>
        </div>
        {rest.map((row) => (
          <div key={row.userId} className={styles.listRow}>
            <span className={styles.listRank}>{row.rank}</span>
            <Avatar name={row.displayName} avatarUrl={row.avatarUrl} className={styles.listAvatar} />
            <span className={styles.listName}>
              {row.displayName} <span aria-hidden="true">{row.countryFlag}</span>
            </span>
            <span className={styles.listValue}>{formatStatValue(category, row.value)}</span>
          </div>
        ))}
        <div className={styles.ellipsis}>···</div>
      </div>

      {/* Always shown, per the spec — this mock deliberately ranks the viewer well outside the
          top 10 to prove the pinned row renders regardless of how far down they are. */}
      <div className={styles.myRankBar}>
        <Avatar name={board.me.displayName} avatarUrl={board.me.avatarUrl} className={styles.listAvatar} />
        <div style={{ flex: 1 }}>
          <div className={styles.myRankName}>
            #{board.me.rank} {board.me.displayName}
          </div>
          <div className={styles.myRankDelta}>↑ {board.me.deltaToNextRank}</div>
        </div>
        <span className={styles.myRankValue}>{formatStatValue(category, board.me.value)}</span>
      </div>
    </div>
  );
}
