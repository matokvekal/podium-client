/**
 * Rider Statistics — Achievements. Route: /stats/achievements.
 *
 * Reproduces images/statisics/achivment.JPG (category tabs, "Your Progress" hero card, the
 * full tier list with earned dates) plus the roadmap-with-a-connecting-line treatment from the
 * achievements panel in all-dark mode.JPG. See StatisticsPage.tsx's own header for what from
 * the wider reference set was deliberately left out of this pass.
 *
 * UI-REVIEW PASS: reads MOCK_RIDER_STATS — see lib/rider-stats-mock.ts's header.
 *
 * Route:   /stats/achievements
 * Loads:   lib/rider-stats-mock.ts (temporary)
 * Actions: category switch; back to /stats
 */

import { ChevronLeft, Gem, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CATEGORY_LABEL,
  formatStatValue,
  MOCK_RIDER_STATS,
  type StatCategory,
} from "../lib/rider-stats-mock";
import { tierColor } from "../lib/rider-stats-ui";
import styles from "./StatisticsAchievementsPage.module.css";
import shared from "./StatisticsShared.module.css";

const CATEGORY_ORDER: StatCategory[] = ["rides", "km", "climbM", "calories"];

export function StatisticsAchievementsPage() {
  const data = MOCK_RIDER_STATS;
  const [category, setCategory] = useState<StatCategory>("rides");

  const progress = data.achievements.find((a) => a.category === category)!;
  const tiers = data.achievementHistory[category];

  return (
    <div className="stack">
      <div className={shared.plainHeader}>
        <Link to="/stats" className={shared.plainHeaderBack} aria-label="Back to Statistics">
          <ChevronLeft width={18} height={18} aria-hidden="true" />
        </Link>
        <h1 className={shared.plainHeaderTitle}>Achievements</h1>
      </div>

      <div className={shared.tabs} role="tablist" aria-label="Achievement category">
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

      {/* The roadmap: every tier for this category, connected by a line, current one glowing. */}
      <div className={styles.roadmap}>
        <div className={styles.roadmapLine} aria-hidden="true" />
        {tiers.map((tier) => (
          <div key={tier.name} className={styles.roadmapStop}>
            <Gem
              className={tier.status === "locked" ? `${shared.gem} ${shared.gemLocked}` : shared.gem}
              style={{ color: tier.status === "locked" ? undefined : tierColor(tier.name) }}
              aria-hidden="true"
            />
            <span className={styles.roadmapName}>{tier.name}</span>
            <span className={styles.roadmapThreshold}>{tier.threshold}</span>
          </div>
        ))}
      </div>

      <div className={`card ${styles.progressCard}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted" style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>
            Your Progress
          </span>
          {progress.next && <span className={styles.percentBadge}>{progress.progressPercent}%</span>}
        </div>
        <div className={styles.progressCardBody}>
          <Gem
            className={shared.gemLg}
            style={{ color: tierColor((progress.current ?? progress.next)?.name) }}
            aria-hidden="true"
          />
          <div>
            <div className={styles.progressTierName}>
              {(progress.current ?? progress.next)?.name} {CATEGORY_LABEL[category]}
            </div>
            {progress.next && (
              <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
                {formatStatValue(category, progress.next.threshold - progress.remaining)} /{" "}
                {formatStatValue(category, progress.next.threshold)}
              </div>
            )}
          </div>
        </div>
        {progress.next && (
          <>
            <div className={shared.progressTrack} aria-hidden="true">
              <div className={shared.progressFill} style={{ width: `${progress.progressPercent}%` }} />
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              {formatStatValue(category, progress.remaining)} remaining
            </p>
          </>
        )}
      </div>

      <div className={`card ${styles.listCard}`}>
        <p className={styles.listTitle}>All Achievements — {CATEGORY_LABEL[category]}</p>
        {tiers.map((tier) => (
          <div key={tier.name} className={styles.tierRow}>
            <Gem
              className={tier.status === "locked" ? `${shared.gem} ${shared.gemLocked}` : shared.gem}
              style={{ color: tier.status === "locked" ? undefined : tierColor(tier.name) }}
              aria-hidden="true"
            />
            <div style={{ flex: 1 }}>
              <div className={styles.tierRowName}>{tier.name} Rider</div>
              <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {formatStatValue(category, tier.threshold)}
              </div>
            </div>
            {tier.status === "earned" && <span className={styles.earnedDate}>{tier.earnedOn}</span>}
            {tier.status === "current" && <span className={styles.inProgress}>In progress</span>}
            {tier.status === "locked" && (
              <Lock width={16} height={16} aria-hidden="true" className="muted" />
            )}
          </div>
        ))}
      </div>

      <p className={shared.quote}>"Discipline today. New horizons tomorrow."</p>
    </div>
  );
}
