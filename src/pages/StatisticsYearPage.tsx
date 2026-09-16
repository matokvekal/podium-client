/**
 * Rider Statistics — Year View. Route: /stats/year.
 *
 * Integrates the React reference component the user provided directly
 * (statisics/year/YearStatisticsMock.tsx) — that component is now the source of truth for this
 * page's UI, not the earlier JPG reference. Markup and class names (kept as literal "yni-*"
 * strings, just moved into a CSS module) are carried over as closely as possible; only a few
 * things were adapted, all necessary to fit the existing app rather than a redesign:
 *
 *   1. The source component wrapped itself in its own fake "phone frame" (.yni-page/.yni-phone,
 *      a floating rounded rectangle on a grey canvas) plus a fake status bar (9:41/signal/wifi/
 *      battery) — that was the mockup tool's presentation chrome, not app UI. Dropped; the real
 *      app already provides the real screen. The `.yni-phone` rule's CSS variables and base
 *      text colour are kept on a plain wrapper so the rest of the (otherwise unmodified) CSS
 *      still resolves the same colours.
 *   2. The source component's bottom nav (Home/Rides/Statistics/Tracks/Groups) was decorative
 *      only in the source too (the buttons have no onClick) — the real app navigates via
 *      AppDrawer's slide-out drawer and has no bottom tab bar anywhere. Dropped for the same
 *      reason as the phone frame: adding one to a single page would look broken, and adding one
 *      app-wide is a far bigger change than "integrate this page." Back navigation instead uses
 *      the real router (Link to="/stats").
 *
 * The provided photos (statisics/year/upper.png, bottom.png) are copied into
 * public/statistics-year-header.png / -footer.png. Both source images carry their OWN baked-in
 * text/logo (visible if you open them directly) which the component's separate HTML text
 * layer would otherwise duplicate — background-position/size below is tuned to keep the
 * cyclist/mountain/road scenery in frame and crop the baked text out.
 *
 * The Rides (bike) and Calories (flame) stat icons use the PNGs the user supplied directly
 * (statisics/year/bike_icon.png, calorie_icon.png) instead of the source component's own custom
 * inline SVGs for just those two, which were reported as not looking right. Both PNGs have an
 * opaque white background (no alpha channel — verified) with no transparent version provided;
 * `mix-blend-mode: multiply` (.yni-icon-img) blends that white into the stat card's own
 * near-white background so it reads as transparent without needing a re-exported asset.
 * Kilometers (pin) and Climb (mountain) keep the source's own inline SVGs — not reported as a
 * problem, and no replacement asset was provided for them.
 *
 * UI-REVIEW PASS: still reads MOCK_RIDER_STATS (lib/rider-stats-mock.ts) — no store, no network
 * call. "Achievements"/"Activity" tabs are present (matching the source component) but
 * placeholder, since those are separate pages built in a later step.
 *
 * Route:   /stats/year
 * Loads:   lib/rider-stats-mock.ts (temporary), public/statistics-year-{header,footer}.png
 * Actions: Overview/Achievements/Activity tab switch (Overview only has content); year prev/next
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MOCK_RIDER_STATS } from "../lib/rider-stats-mock";
import { MockDataNotice } from "./MockDataBadge";
import styles from "./StatisticsYearPage.module.css";

const HERO_IMAGE = "/statistics-year-header.png";
const FOOTER_IMAGE = "/statistics-year-footer.png";
const BIKE_ICON_IMAGE = "/statistics-year-bike-icon.png";
const CALORIE_ICON_IMAGE = "/statistics-year-calorie-icon.png";

type YearTab = "overview" | "achievements" | "activity";

export function StatisticsYearPage() {
  const data = MOCK_RIDER_STATS;
  const [tab, setTab] = useState<YearTab>("overview");
  const [yearIndex, setYearIndex] = useState(0);
  const year = data.perYear[yearIndex];

  const stats: {
    label: string;
    value: string;
    tone: "green" | "blue" | "lime" | "orange";
    icon: ReactNode;
  }[] = [
    {
      label: "Rides",
      value: year.totals.ridesCount.toLocaleString("en-US"),
      tone: "green",
      icon: <img src={BIKE_ICON_IMAGE} alt="" className={styles["yni-icon-img"]} />,
    },
    {
      label: "Kilometers",
      value: year.totals.totalKm.toLocaleString("en-US"),
      tone: "blue",
      icon: <PinIcon />,
    },
    {
      label: "Climb (m)",
      value: year.totals.totalClimbM.toLocaleString("en-US"),
      tone: "lime",
      icon: <MountainIcon />,
    },
    {
      label: "Calories",
      value: (year.totals.totalCalories ?? 0).toLocaleString("en-US"),
      tone: "orange",
      icon: <img src={CALORIE_ICON_IMAGE} alt="" className={styles["yni-icon-img"]} />,
    },
  ];

  return (
    <div className={styles["yni-stats-page"]}>
      <div className={styles["yni-phone"]}>
        {/* HERO */}
        <section
          className={styles["yni-hero"]}
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(9,34,56,.10) 0%, rgba(9,34,56,.18) 48%, rgba(9,34,56,.82) 100%), url("${HERO_IMAGE}")`,
          }}
        >
          <div className={styles["yni-topbar"]}>
            <Link to="/stats" className={styles["yni-icon-btn"]} aria-label="Back to Statistics">
              <ChevronLeftIcon />
            </Link>
            <div className={styles["yni-name"]}>Alex Rider</div>
            <button type="button" className={styles["yni-icon-btn"]} aria-label="Settings">
              <SettingsIcon />
            </button>
          </div>

          <div className={styles["yni-hero-copy"]}>
            <div>Keep riding.</div>
            <div>Good things ahead.</div>
          </div>
        </section>

        {/* SEGMENTED TABS */}
        <div className={styles["yni-tabs-shell"]}>
          <div className={styles["yni-tabs"]} role="tablist" aria-label="Year view section">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "overview"}
              className={
                tab === "overview"
                  ? `${styles["yni-tab"]} ${styles["yni-tab-active"]}`
                  : styles["yni-tab"]
              }
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "achievements"}
              className={
                tab === "achievements"
                  ? `${styles["yni-tab"]} ${styles["yni-tab-active"]}`
                  : styles["yni-tab"]
              }
              onClick={() => setTab("achievements")}
            >
              Achievements
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "activity"}
              className={
                tab === "activity"
                  ? `${styles["yni-tab"]} ${styles["yni-tab-active"]}`
                  : styles["yni-tab"]
              }
              onClick={() => setTab("activity")}
            >
              Activity
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <main className={styles["yni-content"]}>
          {tab !== "overview" ? (
            <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
              {tab === "achievements" ? "Achievements" : "Activity"} — built in a later step.
            </p>
          ) : (
            <section className={styles["yni-season-card"]}>
              <div className={styles["yni-season-header"]}>
                <div className={styles["yni-season-title"]}>
                  <CalendarIcon />
                  <span>{year.year} Season</span>
                </div>

                <div className={styles["yni-season-actions"]}>
                  <button
                    type="button"
                    className={styles["yni-mini-btn"]}
                    aria-label="Previous season"
                    disabled={yearIndex === data.perYear.length - 1}
                    onClick={() => setYearIndex((i) => Math.min(data.perYear.length - 1, i + 1))}
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    className={styles["yni-mini-btn"]}
                    aria-label="Next season"
                    disabled={yearIndex === 0}
                    onClick={() => setYearIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>

              <div style={{ margin: "-4px 0 var(--space-3)" }}>
                <MockDataNotice>
                  This whole page is sample data — not wired to your account yet.
                </MockDataNotice>
              </div>

              {/* STATS */}
              <div className={styles["yni-stats-grid"]}>
                {stats.map((stat) => (
                  <div className={styles["yni-stat-card"]} key={stat.label}>
                    <div className={`${styles["yni-stat-icon"]} ${styles[`yni-${stat.tone}`]}`}>
                      {stat.icon}
                    </div>
                    <div className={styles["yni-stat-copy"]}>
                      <div className={styles["yni-stat-value"]}>{stat.value}</div>
                      <div className={styles["yni-stat-label"]}>{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* GOALS */}
              <div className={styles["yni-goals-title-row"]}>
                <h3>Season Goals</h3>
                <button type="button" className={styles["yni-edit-btn"]}>
                  Edit Goals
                </button>
              </div>

              <div className={styles["yni-goals"]}>
                {year.goals.map((goal) => {
                  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
                  const done = goal.current >= goal.target;

                  return (
                    <div className={styles["yni-goal"]} key={goal.label}>
                      <div className={styles["yni-goal-row"]}>
                        <span className={styles["yni-goal-label"]}>{goal.label}</span>
                        <span className={styles["yni-goal-value"]}>
                          {goal.current.toLocaleString("en-US")} /{" "}
                          {goal.target.toLocaleString("en-US")}
                        </span>
                      </div>

                      <div className={styles["yni-goal-progress-row"]}>
                        <div className={styles["yni-progress-track"]}>
                          <div
                            className={styles["yni-progress-fill"]}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {done ? (
                          <div className={styles["yni-done"]}>
                            <CheckIcon />
                          </div>
                        ) : (
                          <div className={styles["yni-percent"]}>{pct}%</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* FOOTER VISUAL */}
          <section
            className={styles["yni-quote-card"]}
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(3,29,49,.10), rgba(3,29,49,.48)), url("${FOOTER_IMAGE}")`,
            }}
          >
            <div className={styles["yni-quote"]}>
              <span>Same Roads</span>
              <span>Stronger You</span>
            </div>
            <div className={styles["yni-brand"]}>EL NIÑO</div>
          </section>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
 * Inline SVG icons, carried over verbatim from the provided component — no icon package
 * substitution, so shapes stay pixel-identical to the reference.
 * ------------------------------------------------------------ */

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-6.2 6-12A6 6 0 0 0 6 9c0 5.8 6 12 6 12Z" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  );
}

function MountainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 19 6.2-11 3.1 5 2.2-3.3L21 19H3Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-2L17 6l-2.1-2.1-1.8.8a7 7 0 0 0-2-.8L10.5 2h-3l-.7 1.9a7 7 0 0 0-2 .8L3 3.9.9 6l.8 1.8a7 7 0 0 0-.8 2L-1 10.5v3l1.9.7a7 7 0 0 0 .8 2L.9 18 3 20.1l1.8-.8a7 7 0 0 0 2 .8l.7 1.9h3l.7-1.9a7 7 0 0 0 2-.8l1.8.8 2.1-2.1-.8-1.8a7 7 0 0 0 .8-2l1.9-.7Z"
        transform="translate(3)"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}
