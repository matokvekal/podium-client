/**
 * Rider Statistics — Achievements. Route: /stats/achievements.
 *
 * Integrates the React reference component the user provided directly
 * (statisics/achivment/AchievementMock.tsx + .css + README.md) — that package is now the
 * source of truth for this page's UI, per its own README: "the JPG is a visual specification,
 * not inspiration." Markup and class names are carried over as closely as possible.
 *
 * ONE DELIBERATE DEVIATION FROM THE README, not an oversight: the README (written before the
 * JPG gem renders existed) says to use the included flat SVG gems "exactly... do not replace
 * them with another icon pack." Right after handing over the package, the user added five
 * photoreal JPG gem renders (stone/onyx/emerald/ruby/diamond) with an explicit "use these" —
 * the same pattern as the Year View page, where a provided PNG bike/flame icon replaced a
 * flatter inline-SVG equivalent for the same reason. Both the SVGs and JPGs are copied to
 * public/images/statistics/achievements/ (README step 1), but the JPGs are what's actually
 * rendered below. JPG has no alpha channel — each render has its own soft glow baked into a
 * white background, so no CSS drop-shadow is layered on top (that would just shadow the image's
 * rectangle) and no mix-blend trick is needed either, since the surrounding cards are already
 * pure white (#fff) — the JPG's own white background is invisible against it.
 *
 * The other two adaptations, both necessary to fit the real app rather than a redesign:
 *   1. The source's own `.achPage { min-height: 100dvh; ... }` assumed it was the only thing on
 *      the screen. Inside this app's shell (header + this content + footer), forcing another
 *      full viewport height on top of those would push real content below the fold — dropped in
 *      favour of sizing to its own content, matching how every other page here behaves.
 *   2. The header's back button is a real router Link (to /stats) instead of an inert <button>.
 *
 * UI-REVIEW PASS: reads local MOCK data (below, carried over from the source component) — no
 * store, no network call. Category tabs (Rides/Distance/Climb/Calories) switch the active tab
 * visually; only Rides has real content, matching the source (the other three categories' data
 * was never part of this mock either).
 *
 * Route:   /stats/achievements
 * Loads:   public/images/statistics/achievements/*.jpg (temporary, local mock data)
 * Actions: category tab switch (Rides only has content); back to /stats
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./StatisticsAchievementsPage.module.css";

type Category = "rides" | "distance" | "climb" | "calories";

const CATEGORIES: { id: Category; label: string; icon: ReactNode }[] = [
  { id: "rides", label: "Rides", icon: <BikeIcon /> },
  { id: "distance", label: "Distance", icon: <ClockIcon /> },
  { id: "climb", label: "Climb", icon: <MountainIcon /> },
  { id: "calories", label: "Calories", icon: <FlameIcon /> },
];

const GEM_ASSET = (key: string) => `/images/statistics/achievements/${key}.jpg`;

const LEVELS = [
  { key: "stone", name: "Stone", threshold: 25 },
  { key: "onyx", name: "Onyx", threshold: 50 },
  { key: "emerald", name: "Emerald", threshold: 100 },
  { key: "ruby", name: "Ruby", threshold: 200 },
  { key: "diamond", name: "Diamond", threshold: 400 },
];

const MOCK = {
  current: 83,
  nextThreshold: 100,
  progress: 83,
  remaining: 17,
  history: [
    { key: "stone", name: "Stone Rider", value: "25 rides", date: "Feb 12, 2024", unlocked: true },
    { key: "onyx", name: "Onyx Rider", value: "50 rides", date: "Jun 3, 2024", unlocked: true },
    {
      key: "emerald",
      name: "Emerald Rider",
      value: "100 rides",
      date: "Nov 18, 2024",
      unlocked: true,
    },
    { key: "ruby", name: "Ruby Rider", value: "200 rides", date: "", unlocked: false },
    { key: "diamond", name: "Diamond Rider", value: "400 rides", date: "", unlocked: false },
  ],
};

const UNLOCKED_KEYS = new Set(["stone", "onyx", "emerald"]);

export function StatisticsAchievementsPage() {
  const [category, setCategory] = useState<Category>("rides");

  return (
    <div className={styles.achPage}>
      <div className={styles.achShell}>
        <header className={styles.achHeader}>
          <Link to="/stats" className={styles.iconButton} aria-label="Back to Statistics">
            <ChevronLeftIcon />
          </Link>
          <h1>Achievements</h1>
          <span className={styles.headerSpacer} />
        </header>

        <div className={styles.categoryTabs} role="tablist">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={
                category === item.id ? `${styles.categoryTab} ${styles.active}` : styles.categoryTab
              }
              role="tab"
              aria-selected={category === item.id}
            >
              <span className={styles.categoryIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {category !== "rides" ? (
          <section className={styles.progressCard}>
            <p className="muted" style={{ textAlign: "center", padding: "24px 0", margin: 0 }}>
              {CATEGORIES.find((c) => c.id === category)?.label} — built in a later step.
            </p>
          </section>
        ) : (
          <>
            <section className={styles.progressCard}>
              <h2>Your Progress</h2>

              <div className={styles.progressHero}>
                <img src={GEM_ASSET("ruby")} className={styles.heroGem} alt="Ruby achievement" />

                <div className={styles.progressCopy}>
                  <div className={styles.achievementName}>Ruby Rider</div>
                  <div className={styles.achievementValue}>
                    <strong>{MOCK.current}</strong> / {MOCK.nextThreshold} rides
                  </div>

                  <div className={styles.progressLine}>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${MOCK.progress}%` }} />
                    </div>
                    <span className={styles.progressPercent}>{MOCK.progress}%</span>
                  </div>

                  <div className={styles.remainingText}>{MOCK.remaining} rides remaining</div>
                </div>
              </div>

              <div className={styles.gemRail}>
                {LEVELS.map((level) => {
                  const unlocked = UNLOCKED_KEYS.has(level.key);
                  const current = level.key === "ruby";
                  return (
                    <div className={styles.gemLevel} key={level.key}>
                      <div
                        className={current ? `${styles.gemWrap} ${styles.current}` : styles.gemWrap}
                      >
                        <img src={GEM_ASSET(level.key)} alt={level.name} />
                        {unlocked && (
                          <span className={styles.checkBadge}>
                            <CheckIcon />
                          </span>
                        )}
                      </div>
                      <div className={styles.gemName}>{level.name}</div>
                      <div className={styles.gemThreshold}>{level.threshold}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.allCard}>
              <h2>All Achievements – Rides</h2>

              <div className={styles.achievementList}>
                {MOCK.history.map((item) => (
                  <div
                    className={
                      item.unlocked
                        ? styles.achievementRow
                        : `${styles.achievementRow} ${styles.locked}`
                    }
                    key={item.key}
                  >
                    <div className={styles.rowAssetWrap}>
                      {item.unlocked ? (
                        <img src={GEM_ASSET(item.key)} alt="" className={styles.rowGem} />
                      ) : (
                        <span className={styles.lockedCircle}>
                          <LockIcon />
                        </span>
                      )}
                    </div>

                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{item.name}</div>
                      <div className={styles.rowValue}>{item.value}</div>
                    </div>

                    <div className={styles.rowDate}>{item.date}</div>
                  </div>
                ))}
              </div>

              <div className={styles.motivationBox}>
                <MountainMark />
                <div>
                  <div>Discipline today.</div>
                  <div>New horizons tomorrow.</div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
 * Inline SVG icons, carried over verbatim from the provided component — only used for the small
 * category-tab icons and header/status glyphs, not the gems (which are the JPG renders above).
 * ------------------------------------------------------------ */

function BikeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="17.5" r="3.2" />
      <circle cx="18.5" cy="17.5" r="3.2" />
      <path d="M8.3 17.5 11 11h3l4.5 6.5M11 11 8.5 7.5h3.3M10.9 11l-5.4 6.5M13.6 7.5h3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.8V12l3 2M9 3h6" />
    </svg>
  );
}

function MountainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 19 6-10 3 4.5 2.3-3.2L21 19H3Z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2s.8 4.2-2.4 7.3C7.3 12.4 8 16 10 17.5c-4.5-1.2-6.4-6.2-3.4-10.3C8.3 5 9.5 4 9.5 4s.7 2.2.1 4.1C13.1 6.6 13 2 13 2Zm1.7 8.1c3 2 4.3 4.3 3.6 6.8-.6 2.3-2.7 4.1-5.3 4.1-2.3 0-4.3-1.4-5.1-3.3 2.2 1.4 5.1.8 6.2-1.3 1.1-2 .6-4.5.6-6.3Z" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function MountainMark() {
  return (
    <svg className={styles.mountainMark} viewBox="0 0 64 38" aria-hidden="true">
      <path d="m3 31 13-17 8 9 10-15 10 13 6-6 11 16" />
      <path d="M12 33h40" />
    </svg>
  );
}
