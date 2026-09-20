/**
 * Rider Statistics — the personal performance timeline. Route: /stats/achievements.
 *
 * REAL DATA. One block per calendar month (or year), newest first, each with the five results and
 * the gem that period earned. There is no goal, no target, no "next gem", no progress bar
 * anywhere on this page — the gem is a reward for a period already lived, not something to chase.
 *
 * THE CLIENT NEVER COMPUTES A GEM. Every gem shown is `gems[stat]` exactly as the server sent it
 * (server/src/statistics/statistics.gems.ts owns the thresholds); this page never derives one.
 *
 * WHAT COUNTS as a ride is decided on the server: every approved/registered participant of a ride
 * that has finished (by its organizer, or automatically a day after it ended). An operator can
 * tighten that to riders recorded as having turned up — auto check-in at the start, or ticked by the organizer (app_flags
 * stats_require_live_checkin) — nothing here changes when they do.
 *
 * CACHING (lib/statistics-periods.ts has the rules, store/statisticsStore.ts applies them):
 * the current month/year is a live query trusted for 24h; every closed month/year is kept on this
 * device with no expiry until sign-out, so scrolling back through history costs no requests.
 *
 * Route:   /stats/achievements
 * Loads:   GET /statistics/periods via store/statisticsStore.ts (device cache first),
 *          public/images/statistics/achievements/*.jpg (the 5 gem renders)
 * Actions: Month/Year switch (resets the timeline); infinite scroll reveals older periods
 *
 * "Rankings" per period (ME vs OTHER RIDERS) is a later phase — the button below holds its place.
 */

import {
  ArrowDown,
  ArrowUp,
  Bike,
  ChevronLeft,
  ChevronUp,
  Clock,
  Flame,
  Info,
  Mountain,
  Ruler,
  Trophy,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMyIdentity } from "../app/useMyIdentity";
import {
  formatStatValue,
  GEM_ASSET,
  type PeriodType,
  percentChange,
  periodLabel,
  STAT_LABEL,
  STAT_ORDER,
  type StatKey,
  statValue,
} from "../lib/statistics-periods";
import { useStatisticsStore } from "../store/statisticsStore";
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
  const me = useMyIdentity();
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const slot = useStatisticsStore((s) => s.timelines[periodType]);
  const loadTimeline = useStatisticsStore((s) => s.loadTimeline);
  const [count, setCount] = useState(PAGE_SIZE);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The timeline can scroll for a while (infinite scroll, by design) — a jump-to-top button
  // appears once the rider has actually scrolled away from the header/period toggle.
  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The device cache paints first, so switching Month/Year is instant when it has been visited.
  useEffect(() => {
    if (me.userId != null) void loadTimeline(me.userId, periodType);
  }, [me.userId, periodType, loadTimeline]);

  // Every period the store holds (newest first); `count` only limits how many are drawn at once.
  const allPeriods = slot.data?.periods ?? [];
  const periods = allPeriods.slice(0, count);
  const hasMore = periods.length < allPeriods.length;
  const noRidesYet = allPeriods.length > 0 && allPeriods.every((p) => p.rides === 0);
  const needsWeight =
    slot.data != null && slot.data.weightKg == null && allPeriods.some((p) => p.calories == null);

  function switchPeriodType(next: PeriodType) {
    setPeriodType(next);
    setCount(PAGE_SIZE);
  }

  // Infinite scroll: reveal the next batch of older periods as the sentinel comes into view —
  // same IntersectionObserver-over-a-sentinel pattern already used elsewhere in this app
  // (TrackGallerySheet). All the periods are already on the device, so this only widens the slice
  // that is drawn; it never makes a request.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

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

      {me.userId == null || (slot.loading && slot.data == null) ? (
        <p className={styles.note} role="status">
          Loading your results…
        </p>
      ) : slot.failed ? (
        <p className={styles.note} role="alert">
          Could not load your results right now.{" "}
          <button
            type="button"
            className={styles.noteButton}
            onClick={() => me.userId != null && void loadTimeline(me.userId, periodType)}
          >
            Try again
          </button>
        </p>
      ) : (
        <>
          {noRidesYet && (
            <p className={styles.note}>
              No rides counted yet. A ride counts once you have joined it and it has finished.
            </p>
          )}
          {needsWeight && (
            <p className={styles.note}>
              Calories need your weight — <Link to="/account">add it in Account</Link> and they will
              show here.
            </p>
          )}
        </>
      )}

      <div className={styles.timeline}>
        {periods.map((period, i) => {
          return (
            <section className={styles.periodBlock} key={period.period}>
              <div className={styles.periodHeaderRow}>
                <h2 className={styles.periodLabel}>{periodLabel(periodType, period.period)}</h2>
                {i === 0 && <span className={styles.currentBadge}>Current</span>}
              </div>

              <div className={styles.statList}>
                {STAT_ORDER.map((key: StatKey) => {
                  const value = statValue(period, key);
                  const gem = period.gems[key];
                  const trend = percentChange(value, statValue(period.previous, key));
                  return (
                    <div className={styles.statRow} key={key}>
                      <span className={styles.statIcon}>{STAT_ICON[key]}</span>
                      <span className={styles.statLabel}>{STAT_LABEL[key]}</span>
                      <span className={styles.statValue}>{formatStatValue(key, value)}</span>
                      {trend != null && (
                        <span
                          className={trend >= 0 ? styles.trendUp : styles.trendDown}
                          title={`${trend >= 0 ? "Up" : "Down"} ${Math.abs(trend)}% vs ${
                            periodType === "month" ? "last month" : "last year"
                          }`}
                        >
                          {trend >= 0 ? (
                            <ArrowUp aria-hidden="true" />
                          ) : (
                            <ArrowDown aria-hidden="true" />
                          )}
                          {Math.abs(trend)}%
                        </span>
                      )}
                      <span className={styles.statGemFrame}>
                        <img
                          src={GEM_ASSET(gem)}
                          alt={gem}
                          className={styles.statGem}
                          title={gem}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Reserved for the "ME vs OTHER RIDERS" phase — top 3 + my rank per category, for
                  this same period. Not built yet; this affordance just holds its place in the
                  layout, per instruction to design for it now and build it later. */}
              <button type="button" className={styles.rankingsButton} disabled title="Coming soon">
                <Trophy aria-hidden="true" />
                Rankings for {periodLabel(periodType, period.period)}
              </button>
            </section>
          );
        })}
        <div ref={sentinelRef} aria-hidden="true" />
      </div>

      {showBackToTop && (
        <button
          type="button"
          className={styles.backToTop}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ChevronUp aria-hidden="true" />
        </button>
      )}

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
                <span className={styles.legendGemFrame}>
                  <img src={GEM_ASSET(gem)} alt={gem} className={styles.legendGem} />
                </span>
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
