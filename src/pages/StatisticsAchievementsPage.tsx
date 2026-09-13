/**
 * Rider Statistics — the personal performance timeline. Route: /stats/achievements.
 *
 * REPLACES the earlier tabs + 5-gem-progression-rail Achievements design entirely, per explicit
 * product correction: "the old Achievements design/progression screen is no longer the product
 * direction." There is no goal, no target, no "next gem", no progress bar anywhere on this page
 * — the gem is a reward for a period already lived, not something to chase. See
 * lib/statistics-timeline-mock.ts's header for the exact shape this mirrors.
 *
 * THE CLIENT NEVER COMPUTES A GEM. Every gem shown here is a mock stand-in for a value a future
 * server endpoint returns (thresholds differ per metric AND per month-vs-year, and live in
 * server config) — this page only ever renders `stat.gem`, never derives one.
 *
 * Concept: MY ACTUAL PERFORMANCE + MY GEM FOR IT + MY HISTORY (this page) + MY RANKING (a later
 * phase — "ME vs OTHER RIDERS", explicitly deferred). Each period block below has a "Rankings"
 * affordance reserved for that later phase; it does nothing yet.
 *
 * Route:   /stats/achievements
 * Loads:   lib/statistics-timeline-mock.ts (temporary — a real endpoint returns this same shape
 *          per period), public/images/statistics/achievements/*.jpg (the 5 gem renders)
 * Actions: Month/Year switch (resets the timeline); infinite scroll loads older periods
 */

import { Bike, ChevronLeft, Clock, Flame, Info, Mountain, Ruler, Trophy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatStatValue,
  GEM_ASSET,
  getMonthlyPeriods,
  getYearlyPeriods,
  type PeriodStats,
  type PeriodType,
  STAT_LABEL,
  STAT_ORDER,
  type StatKey,
} from "../lib/statistics-timeline-mock";
import styles from "./StatisticsAchievementsPage.module.css";

const STAT_ICON: Record<StatKey, ReactNode> = {
  hours: <Clock aria-hidden="true" />,
  rides: <Bike aria-hidden="true" />,
  calories: <Flame aria-hidden="true" />,
  distance: <Ruler aria-hidden="true" />,
  climb: <Mountain aria-hidden="true" />,
};

const PAGE_SIZE = 6;

export function StatisticsAchievementsPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [count, setCount] = useState(PAGE_SIZE);
  const [legendOpen, setLegendOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const periods: PeriodStats[] =
    periodType === "month" ? getMonthlyPeriods(count) : getYearlyPeriods(count);

  function switchPeriodType(next: PeriodType) {
    setPeriodType(next);
    setCount(PAGE_SIZE);
  }

  // Infinite scroll: load the next batch of older periods as the sentinel comes into view —
  // same IntersectionObserver-over-a-sentinel pattern already used elsewhere in this app
  // (TrackGallerySheet). Mock data is generated on demand, so "loading more" is just asking for
  // a longer slice; a real endpoint would page here instead.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/stats" className={styles.iconButton} aria-label="Back to Statistics">
          <ChevronLeft aria-hidden="true" />
        </Link>
        <h1>Statistics</h1>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="What do the gems mean?"
          onClick={() => setLegendOpen(true)}
        >
          <Info aria-hidden="true" />
        </button>
      </header>

      <div className={styles.periodTabs} role="tablist" aria-label="Statistics period">
        <button
          type="button"
          role="tab"
          aria-selected={periodType === "month"}
          className={
            periodType === "month" ? `${styles.periodTab} ${styles.active}` : styles.periodTab
          }
          onClick={() => switchPeriodType("month")}
        >
          Month
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={periodType === "year"}
          className={
            periodType === "year" ? `${styles.periodTab} ${styles.active}` : styles.periodTab
          }
          onClick={() => switchPeriodType("year")}
        >
          Year
        </button>
      </div>

      <p className={styles.sectionEyebrow}>MY RESULTS</p>

      <div className={styles.timeline}>
        {periods.map((period, i) => (
          <section className={styles.periodBlock} key={period.period}>
            <div className={styles.periodHeaderRow}>
              <h2 className={styles.periodLabel}>{period.label}</h2>
              {i === 0 && <span className={styles.currentBadge}>Current</span>}
            </div>

            <div className={styles.statList}>
              {STAT_ORDER.map((key) => {
                const stat = period.stats[key];
                return (
                  <div className={styles.statRow} key={key}>
                    <span className={styles.statIcon}>{STAT_ICON[key]}</span>
                    <span className={styles.statLabel}>{STAT_LABEL[key]}</span>
                    <span className={styles.statValue}>{formatStatValue(stat)}</span>
                    <img
                      src={GEM_ASSET(stat.gem)}
                      alt={stat.gem}
                      className={styles.statGem}
                      title={stat.gem}
                    />
                  </div>
                );
              })}
            </div>

            {/* Reserved for the "ME vs OTHER RIDERS" phase — top 3 + my rank per category, for
                this same period. Not built yet; this affordance just holds its place in the
                layout, per instruction to design for it now and build it later. */}
            <button type="button" className={styles.rankingsButton} disabled title="Coming soon">
              <Trophy aria-hidden="true" />
              Rankings for {period.label}
            </button>
          </section>
        ))}
        <div ref={sentinelRef} aria-hidden="true" />
      </div>

      {legendOpen && (
        <div
          className={styles.legendOverlay}
          onClick={() => setLegendOpen(false)}
          aria-hidden="true"
        />
      )}
      {legendOpen && (
        <div className={styles.legendSheet} role="dialog" aria-label="Achievement levels">
          <div className={styles.legendHeader}>
            <h2>Achievement Levels</h2>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setLegendOpen(false)}
              aria-label="Close"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <p className="muted" style={{ margin: "0 0 var(--space-3)" }}>
            Every result you post — for a month or a year — earns one of these, based on how it
            compares. Not a goal to chase, just a mark of what you already did.
          </p>
          <div className={styles.legendGrid}>
            {(["stone", "onyx", "emerald", "ruby", "diamond"] as const).map((gem) => (
              <div className={styles.legendItem} key={gem}>
                <img src={GEM_ASSET(gem)} alt={gem} className={styles.legendGem} />
                <span className={styles.legendName}>
                  {gem.charAt(0).toUpperCase() + gem.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
