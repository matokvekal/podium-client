/**
 * Rider Statistics. Route: /stats.
 *
 * THE YEAR-VIEW DESIGN IS NOW THIS PAGE. It used to live at /stats/year (StatisticsYearPage.tsx,
 * mock-only, hardcoded "Alex Rider") while /stats showed an older, unrelated "Me | Year" layout —
 * two pages for one screen, and the approved design was on the route nobody links to. The design
 * (year view.JPG: photo hero, Overview/Achievements/Activity tabs, "<year> Season" card, four
 * tinted stat tiles, Season Goals bars, "Same Roads Stronger You" footer) was moved here verbatim,
 * markup and CSS both, and wired to the REAL store instead of the mock. /stats/year now redirects
 * here so the old URL keeps working.
 *
 * REAL DATA: reads useStatisticsStore (GET /api/v1/statistics/me), cache-first via local-db.ts —
 * see statisticsStore.ts's own header. Rider name comes from useMyIdentity, not the mock's
 * "Alex Rider".
 *
 * SEASON GOALS — the one part with no real source. There is no target field anywhere in the
 * schema; a goal is something a rider sets, and no such feature exists yet. So the TARGETS are
 * the design's own placeholder numbers (SEASON_GOAL_TARGETS below) and are labelled as sample,
 * while the PROGRESS against them is the rider's real season total — no invented current values
 * sitting next to real ones (sql/022, sql/034). Drop the badge and the constant the moment goal
 * setting is a real feature; "Edit Goals" stays disabled until then.
 *
 * The three tabs: Overview is the design. Achievements carries what the old /stats page had that
 * the design has no slot for (all-time totals, next milestone, the National Leaderboard link) and
 * links on to the full /stats/achievements page. Activity has no data source yet.
 *
 * Route:   /stats
 * Loads:   store/statisticsStore.ts -> GET /api/v1/statistics/me,
 *          public/statistics-year-{header,footer}.png, -{bike,calorie}-icon.png
 * Actions: Overview/Achievements/Activity tabs; season prev/next; links to Achievements and
 *          Leaderboard
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMyIdentity } from "../app/useMyIdentity";
import { MOCK_RIDER_STATS, type StatTotals } from "../lib/rider-stats-mock";
import { tierColor } from "../lib/rider-stats-ui";
import type { RiderStatsPayload, StatYearTotals } from "../store/statisticsStore";
import { useStatisticsStore } from "../store/statisticsStore";
import { MockDataNotice } from "./MockDataBadge";
import styles from "./StatisticsPage.module.css";

const HERO_IMAGE = "/statistics-year-header.png";
const FOOTER_IMAGE = "/statistics-year-footer.png";
const BIKE_ICON_IMAGE = "/statistics-year-bike-icon.png";
const CALORIE_ICON_IMAGE = "/statistics-year-calorie-icon.png";

type Tab = "overview" | "achievements" | "activity";

/** Placeholder targets, straight from the reference design — NOT rider-set, because nothing in
 *  the schema can store a rider-set goal yet. Always rendered behind a MockDataNotice. */
const SEASON_GOAL_TARGETS = [
  { label: "1,000 km", target: 1000, of: (y: StatYearTotals) => y.distanceKm },
  { label: "5,000 m climb", target: 5000, of: (y: StatYearTotals) => y.climbM },
  { label: "50 rides", target: 50, of: (y: StatYearTotals) => y.rides },
];

/** MOCK_RIDER_STATS predates the real store's field names (ridesCount/totalKm/totalClimbM, no
 *  hours) — mapped here rather than changed at the source. `hours` has no mock equivalent, so it
 *  is estimated from distance at a plausible average speed: fine for a value that is already,
 *  visibly, sample data (see MockDataBadge.tsx), never done for a real number. */
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
  const [tab, setTab] = useState<Tab>("overview");
  const [yearIndex, setYearIndex] = useState(0);

  useEffect(() => {
    if (me.userId != null) void loadMyStatistics(me.userId);
  }, [me.userId, loadMyStatistics]);

  // While the real fetch has never once succeeded (not "genuinely zero rides" — that has its own
  // honest welcome card below — but the request itself failing, e.g. the backend migrations not
  // being live anywhere yet), show what this page looks like with sample data rather than a bare
  // "unavailable" card. Delete once GET /statistics/me can answer for real.
  const usingMock = !loading && !real;
  const data = real ?? (usingMock ? MOCK_PAYLOAD : null);
  const year = data?.byYear[yearIndex];
  const hero = data
    ? [...data.achievements].sort((a, b) => b.progressPercent - a.progressPercent)[0]
    : null;

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
            <Link to="/" className={styles["yni-icon-btn"]} aria-label="Back to rides">
              <ChevronLeftIcon />
            </Link>
            <div className={styles["yni-name"]}>{me.displayName}</div>
            <Link to="/account" className={styles["yni-icon-btn"]} aria-label="Account settings">
              <SettingsIcon />
            </Link>
          </div>

          <div className={styles["yni-hero-copy"]}>
            <div>Keep riding.</div>
            <div>Good things ahead.</div>
          </div>
        </section>

        {/* SEGMENTED TABS */}
        <div className={styles["yni-tabs-shell"]}>
          <div className={styles["yni-tabs"]} role="tablist" aria-label="Statistics section">
            {(
              [
                ["overview", "Overview"],
                ["achievements", "Achievements"],
                ["activity", "Activity"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={
                  tab === key
                    ? `${styles["yni-tab"]} ${styles["yni-tab-active"]}`
                    : styles["yni-tab"]
                }
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <main className={styles["yni-content"]}>
          {!data ? (
            <section className={styles["yni-season-card"]}>
              <p className={styles["yni-placeholder"]}>Loading your statistics…</p>
            </section>
          ) : tab === "activity" ? (
            <section className={styles["yni-season-card"]}>
              <p className={styles["yni-placeholder"]}>
                A ride-by-ride activity feed lands here in a later step.
              </p>
            </section>
          ) : tab === "achievements" ? (
            <section className={styles["yni-season-card"]}>
              <div className={styles["yni-season-header"]}>
                <div className={styles["yni-season-title"]}>
                  <GemIcon />
                  <span>All Time</span>
                </div>
              </div>

              {usingMock && (
                <div className={styles["yni-mock-line"]}>
                  <MockDataNotice>
                    Sample numbers — we couldn't load your real statistics.{" "}
                    <button
                      type="button"
                      className={styles["yni-retry-btn"]}
                      onClick={() => me.userId != null && void loadMyStatistics(me.userId)}
                    >
                      Try again
                    </button>
                  </MockDataNotice>
                </div>
              )}

              <StatGrid totals={data.lifetime} />

              {hero && (
                <>
                  <div className={styles["yni-goals-title-row"]}>
                    <h3>Next Milestone</h3>
                    <Link to="/stats/achievements" className={styles["yni-edit-btn"]}>
                      View All
                    </Link>
                  </div>

                  <div className={styles["yni-milestone"]}>
                    <GemIcon
                      className={styles["yni-milestone-gem"]}
                      color={tierColor(hero.next?.name)}
                    />
                    <div className={styles["yni-milestone-copy"]}>
                      <div className={styles["yni-goal-label"]}>
                        {hero.next?.name ?? "All unlocked"}
                      </div>
                      {hero.next && (
                        <>
                          <div className={styles["yni-goal-value"]}>
                            {(hero.next.threshold - hero.remaining).toLocaleString("en-US")} /{" "}
                            {hero.next.threshold.toLocaleString("en-US")} — {hero.remaining}{" "}
                            remaining
                          </div>
                          <div className={styles["yni-progress-track"]}>
                            <div
                              className={styles["yni-progress-fill"]}
                              style={{ width: `${hero.progressPercent}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Link to="/stats/leaderboard" className={styles["yni-link-row"]}>
                <TrophyIcon />
                <span>See the National Leaderboard</span>
                <ChevronRightIcon />
              </Link>
            </section>
          ) : data.byYear.length === 0 || !year ? (
            <section className={styles["yni-season-card"]}>
              <div className={styles["yni-season-title"]}>Your cycling story starts here</div>
              <p className={styles["yni-placeholder"]}>
                Finish your first ride and every number here fills in — rides, kilometers, climb and
                calories, season by season.
              </p>
              <Link to="/" className="button">
                Find a ride
              </Link>
            </section>
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
                    disabled={yearIndex === data.byYear.length - 1}
                    onClick={() => setYearIndex((i) => Math.min(data.byYear.length - 1, i + 1))}
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

              {usingMock && (
                <div className={styles["yni-mock-line"]}>
                  <MockDataNotice>
                    Sample numbers — we couldn't load your real statistics.{" "}
                    <button
                      type="button"
                      className={styles["yni-retry-btn"]}
                      onClick={() => me.userId != null && void loadMyStatistics(me.userId)}
                    >
                      Try again
                    </button>
                  </MockDataNotice>
                </div>
              )}

              <StatGrid totals={year} />

              {/* GOALS */}
              <div className={styles["yni-goals-title-row"]}>
                <h3>Season Goals</h3>
                <button type="button" className={styles["yni-edit-btn"]} disabled>
                  Edit Goals
                </button>
              </div>

              <div className={styles["yni-mock-line"]}>
                <MockDataNotice>
                  Sample targets — setting your own goals isn't live yet. Progress is real.
                </MockDataNotice>
              </div>

              <div className={styles["yni-goals"]}>
                {SEASON_GOAL_TARGETS.map((goal) => {
                  const current = goal.of(year);
                  const pct = Math.min(100, Math.round((current / goal.target) * 100));
                  const done = current >= goal.target;

                  return (
                    <div key={goal.label}>
                      <div className={styles["yni-goal-row"]}>
                        <span className={styles["yni-goal-label"]}>{goal.label}</span>
                        <span className={styles["yni-goal-value"]}>
                          {current.toLocaleString("en-US")} / {goal.target.toLocaleString("en-US")}
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

/** The four tinted tiles — identical for a season and for all-time, so one component. */
function StatGrid({ totals }: { totals: StatYearTotals }) {
  const stats: { label: string; value: string; tone: string; icon: ReactNode }[] = [
    {
      label: "Rides",
      value: totals.rides.toLocaleString("en-US"),
      tone: "yni-green",
      icon: <img src={BIKE_ICON_IMAGE} alt="" className={styles["yni-icon-img"]} />,
    },
    {
      label: "Kilometers",
      value: totals.distanceKm.toLocaleString("en-US"),
      tone: "yni-blue",
      icon: <PinIcon />,
    },
    {
      label: "Climb (m)",
      value: totals.climbM.toLocaleString("en-US"),
      tone: "yni-lime",
      icon: <MountainIcon />,
    },
    {
      label: "Calories",
      value: totals.calories == null ? "—" : totals.calories.toLocaleString("en-US"),
      tone: "yni-orange",
      icon: <img src={CALORIE_ICON_IMAGE} alt="" className={styles["yni-icon-img"]} />,
    },
  ];

  return (
    <div className={styles["yni-stats-grid"]}>
      {stats.map((stat) => (
        <div className={styles["yni-stat-card"]} key={stat.label}>
          <div className={`${styles["yni-stat-icon"]} ${styles[stat.tone]}`}>{stat.icon}</div>
          <div className={styles["yni-stat-copy"]}>
            <div className={styles["yni-stat-value"]}>{stat.value}</div>
            <div className={styles["yni-stat-label"]}>{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------
 * Inline SVG icons, carried over verbatim from the provided reference component — no icon
 * package substitution, so shapes stay pixel-identical to the reference.
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

function GemIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ color }}>
      <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
      <path d="M3 9h18M9 3l3 18M15 3l-3 18" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9M12 14v3m-4 3h8" />
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
