/**
 * Rider Statistics — Year View. Route: /stats/year.
 *
 * This is a literal reproduction of images/statisics/year view.JPG — that file is the UI
 * specification, not inspiration. Match layout/cards/hierarchy/spacing/tabs/progress exactly;
 * do not redesign. Built as its own isolated route so it can be reviewed on its own before the
 * other Statistics pages (menu entry, My Statistics, Achievements, Leaderboard) are touched.
 *
 * ONE DELIBERATE DEVIATION, not an oversight — flagged for review: the reference shows a
 * persistent bottom tab bar (Home/Rides/Statistics/Tracks/More) on every screen. The real El
 * Niño app has no bottom tab bar anywhere — it navigates via AppDrawer's slide-out drawer only.
 * Adding one here alone (and not on any other page) would look broken, and adding one app-wide
 * is a much bigger change than "rebuild this page." Everything ABOVE the bottom nav is
 * reproduced as closely as possible; back navigation instead goes to /stats.
 *
 * UI-REVIEW PASS: reads MOCK_RIDER_STATS (lib/rider-stats-mock.ts) — see its header. "Overview"
 * is the only tab with real content; "Achievements"/"Activity" are present (matching the
 * reference) but placeholders, since those are their own pages built in a later step.
 *
 * Route:   /stats/year
 * Loads:   lib/rider-stats-mock.ts (temporary)
 * Actions: Overview/Achievements/Activity tab switch (Overview only has content); year prev/next
 */

import {
  Bike,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  MapPin,
  Mountain,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MOCK_RIDER_STATS } from "../lib/rider-stats-mock";
import shared from "./StatisticsShared.module.css";
import styles from "./StatisticsYearPage.module.css";

type YearTab = "overview" | "achievements" | "activity";

export function StatisticsYearPage() {
  const data = MOCK_RIDER_STATS;
  const [tab, setTab] = useState<YearTab>("overview");
  const [yearIndex, setYearIndex] = useState(0);

  const year = data.perYear[yearIndex];

  return (
    <div>
      <div className={`${shared.hero} ${styles.hero}`}>
        <div className={shared.heroTopRow}>
          <Link to="/stats" className={shared.heroBackBtn} aria-label="Back to Statistics">
            <ChevronLeft width={18} height={18} aria-hidden="true" />
          </Link>
          <span className={styles.heroName}>Alex Rider</span>
          <button type="button" className={shared.heroIconBtn} aria-label="Settings">
            <Settings width={17} height={17} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.heroTagline}>
          Keep riding.
          <br />
          Good things ahead.
        </p>
      </div>

      <div className={styles.sheet}>
        <div className={shared.tabs} role="tablist" aria-label="Year view section">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            className={tab === "overview" ? shared.tabActive : shared.tab}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "achievements"}
            className={tab === "achievements" ? shared.tabActive : shared.tab}
            onClick={() => setTab("achievements")}
          >
            Achievements
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={tab === "activity" ? shared.tabActive : shared.tab}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
        </div>

        {tab !== "overview" ? (
          <p className="muted" style={{ textAlign: "center", padding: "var(--space-5) 0" }}>
            {tab === "achievements" ? "Achievements" : "Activity"} — built in a later step.
          </p>
        ) : (
          <>
            <div className={styles.seasonRow}>
              <Calendar width={16} height={16} aria-hidden="true" className={styles.seasonIcon} />
              <span className={styles.seasonTitle}>{year.year} Season</span>
              <button
                type="button"
                className={styles.seasonArrow}
                disabled={yearIndex === data.perYear.length - 1}
                onClick={() => setYearIndex((i) => Math.min(data.perYear.length - 1, i + 1))}
                aria-label="Previous season"
              >
                <ChevronLeft width={15} height={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.seasonArrow}
                disabled={yearIndex === 0}
                onClick={() => setYearIndex((i) => Math.max(0, i - 1))}
                aria-label="Next season"
              >
                <ChevronRight width={15} height={15} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.tileGrid}>
              <div className={styles.tile}>
                <Bike width={22} height={22} aria-hidden="true" className={styles.tileIconBike} />
                <div>
                  <div className={styles.tileValue}>{year.totals.ridesCount.toLocaleString("en-US")}</div>
                  <div className={styles.tileLabel}>Rides</div>
                </div>
              </div>
              <div className={styles.tile}>
                <MapPin width={22} height={22} aria-hidden="true" className={styles.tileIconKm} />
                <div>
                  <div className={styles.tileValue}>{year.totals.totalKm.toLocaleString("en-US")}</div>
                  <div className={styles.tileLabel}>Kilometers</div>
                </div>
              </div>
              <div className={styles.tile}>
                <Mountain width={22} height={22} aria-hidden="true" className={styles.tileIconClimb} />
                <div>
                  <div className={styles.tileValue}>
                    {year.totals.totalClimbM.toLocaleString("en-US")}
                  </div>
                  <div className={styles.tileLabel}>Climb (m)</div>
                </div>
              </div>
              <div className={styles.tile}>
                <Flame width={22} height={22} aria-hidden="true" className={styles.tileIconCal} />
                <div>
                  <div className={styles.tileValue}>
                    {(year.totals.totalCalories ?? 0).toLocaleString("en-US")}
                  </div>
                  <div className={styles.tileLabel}>Calories</div>
                </div>
              </div>
            </div>

            <div className={styles.goalsHeader}>
              <span className={styles.goalsTitle}>Season Goals</span>
              <button type="button" className={styles.editGoals}>
                Edit Goals
              </button>
            </div>

            <div className={styles.goalsList}>
              {year.goals.map((goal) => {
                const percent = Math.min(100, Math.round((goal.current / goal.target) * 100));
                const met = goal.current >= goal.target;
                return (
                  <div key={goal.label} className={styles.goalRow}>
                    <div className={styles.goalTopRow}>
                      <span className={styles.goalLabel}>{goal.label}</span>
                      <span className={styles.goalFraction}>
                        {goal.current.toLocaleString("en-US")} / {goal.target.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className={styles.goalBarRow}>
                      <div className={styles.goalTrack} aria-hidden="true">
                        <div
                          className={styles.goalFill}
                          style={{ width: `${percent}%` }}
                          data-met={met || undefined}
                        />
                      </div>
                      {met ? (
                        <span className={styles.goalCheck} aria-label="Goal complete">
                          ✓
                        </span>
                      ) : (
                        <span className={styles.goalPercent}>{percent}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className={styles.footerPhoto}>
          <p className={styles.footerQuote}>
            Same Roads
            <br />
            Stronger You
          </p>
          <p className={styles.footerBrand}>EL NIÑO</p>
        </div>
      </div>
    </div>
  );
}
