/**
 * National Leaderboard. Route: /stats/leaderboard.
 *
 * UI-REVIEW PASS, replacing the earlier Top-10 mock (images/statisics/board.JPG) with the
 * approved "National Champions" reference supplied directly
 * (statisics/board/elnino-national-leaderboard-mock.zip — NationalLeaderboardMock.tsx/.css,
 * mockLeaderboard.ts, assets/). This is a rider-vs-EVERYONE-ELSE screen (a country
 * championship), distinct from the me-vs-myself history the rest of Statistics covers — see
 * README.md in that package.
 *
 * Reads lib/national-leaderboard-mock.ts (a near-literal port of the supplied mock data) —
 * not the network. No API contract exists for this yet; wiring it to a real
 * GET /leaderboard is a separate pass once this UI is approved.
 *
 * Exactly four categories, in this fixed order: Rides, Climb, Distance, Hours. No Calories —
 * asked for directly.
 *
 * Route:   /stats/leaderboard
 * Loads:   lib/national-leaderboard-mock.ts (mock, 300 rows per category)
 * Actions: category tabs; country/state scope select (state has no real subdivision data yet,
 *          so it only relabels the scope — see the select's own comment); year select (cosmetic,
 *          every year reads the same mock rows); "Where am I?" scrolls the ranked list to the
 *          mocked current rider's row, which is also highlighted green wherever it appears
 *          (podium or list).
 */

import { ChevronLeft, LocateFixed } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import {
  CURRENT_RIDER_ID,
  type LeaderboardMetric,
  makeNationalLeaderboard,
  metricMeta,
} from "../lib/national-leaderboard-mock";
import styles from "./StatisticsLeaderboardPage.module.css";
import shared from "./StatisticsShared.module.css";

const METRICS: LeaderboardMetric[] = ["rides", "climb", "distance", "hours"];
const YEARS = [2026, 2025, 2024];
// Silver / gold / bronze left-to-right, gold centred and tallest — same order the reference
// podium uses.
const PODIUM_ORDER = [1, 0, 2];

export function StatisticsLeaderboardPage() {
  const [metric, setMetric] = useState<LeaderboardMetric>("rides");
  const [scope, setScope] = useState<"country" | "state">("country");
  const [year, setYear] = useState(YEARS[0]);

  const rows = useMemo(() => makeNationalLeaderboard(metric), [metric]);
  const podium = [rows[0], rows[1], rows[2]];
  const rest = rows.slice(3);
  const currentRider = rows.find((r) => r.id === CURRENT_RIDER_ID) ?? null;
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  function scrollToMe() {
    currentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="stack">
      <div className={`${shared.hero} ${styles.hero}`}>
        <div className={shared.heroTopRow}>
          <Link to="/stats" className={shared.heroBackBtn} aria-label="Back to Statistics">
            <ChevronLeft width={18} height={18} aria-hidden="true" />
          </Link>
          <div className={styles.heroTitleBlock}>
            <h1 className={shared.heroTitle}>National Champions</h1>
            <p className={shared.heroSubtitle}>Ride Further Together</p>
          </div>
          <img
            src="/images/statistics/leaderboard/trophy.svg"
            alt=""
            aria-hidden="true"
            className={styles.heroTrophy}
          />
        </div>

        <div className={styles.filters}>
          {/* State/region has no real subdivision data yet (no per-country region list wired
              to this mock) — the select only relabels the scope for now; see the file header. */}
          <select
            className={styles.filterSelect}
            value={scope}
            onChange={(e) => setScope(e.target.value as "country" | "state")}
            aria-label="Championship scope"
          >
            <option value="country">🇮🇱 Israel</option>
            <option value="state">State / Region</option>
          </select>
          <select
            className={styles.filterSelect}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Championship year"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Leaderboard category">
          {METRICS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={metric === key}
              className={metric === key ? styles.tabActive : styles.tab}
              onClick={() => setMetric(key)}
            >
              <img src={metricMeta[key].icon} alt="" aria-hidden="true" />
              <span>{metricMeta[key].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.podium}>
        {PODIUM_ORDER.map((rowIndex, position) => {
          const row = podium[rowIndex];
          if (!row) return <div key={rowIndex} />;
          const place = position === 0 ? 2 : position === 1 ? 1 : 3;
          return (
            <article
              key={row.id}
              className={styles.podiumSpot}
              data-place={place}
              data-me={row.id === CURRENT_RIDER_ID || undefined}
            >
              <div className={styles.podiumRing}>
                <Avatar
                  name={row.name}
                  avatarUrl={row.avatar}
                  seed={row.id}
                  className={styles.podiumAvatar}
                />
              </div>
              <strong className={styles.podiumPlace}>{place}</strong>
              <h3 className={styles.podiumName}>{row.name}</h3>
              <b className={styles.podiumValue}>
                {row.value.toLocaleString()} {row.unit}
              </b>
              <small aria-hidden="true">🇮🇱</small>
            </article>
          );
        })}
      </div>

      <section className={`card ${styles.listCard}`}>
        <div className={styles.listHeader}>
          <span>#</span>
          <span style={{ flex: 1 }}>Rider</span>
          <span>{metricMeta[metric].label}</span>
        </div>

        <div className={styles.listScroll}>
          {rest.map((row) => {
            const isMe = row.id === CURRENT_RIDER_ID;
            return (
              <div
                key={row.id}
                ref={isMe ? currentRowRef : undefined}
                className={isMe ? styles.listRowMe : styles.listRow}
              >
                <span className={styles.listRank}>{row.rank}</span>
                <Avatar
                  name={row.name}
                  avatarUrl={row.avatar}
                  seed={row.id}
                  className={styles.listAvatar}
                />
                <span className={styles.listName}>
                  {row.name} <span aria-hidden="true">🇮🇱</span>
                </span>
                <span className={styles.listValue}>
                  {row.value.toLocaleString()} {row.unit}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {currentRider && (
        <button type="button" className={styles.findMe} onClick={scrollToMe}>
          <LocateFixed width={18} height={18} aria-hidden="true" />
          <span>Where am I?</span>
          <b>#{currentRider.rank}</b>
        </button>
      )}
    </div>
  );
}
