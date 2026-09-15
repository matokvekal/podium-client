/**
 * National Leaderboard. Route: /stats/leaderboard.
 *
 * REAL DATA: reads useStatisticsStore (GET /api/v1/statistics/leaderboard), cache-first via
 * local-db.ts. Visual structure reproduces the approved "National Champions" reference
 * (statisics/board/ — NationalLeaderboardMock.tsx/.css, mockLeaderboard.ts, assets/); see that
 * package's README.md.
 *
 * Exactly four categories, in this fixed order: Rides, Distance, Climb, Hours. No Calories —
 * asked for directly (calories stay on the rider's personal Statistics screen, not here). Hours
 * is accumulated riding/activity duration, not elapsed calendar time.
 *
 * COUNTRY, NOT STATE: the scope select's "State / Region" option is left in but does not change
 * the query — there is no per-state subdivision data anywhere in the schema yet (see the
 * architecture note in statistics.service.ts). The country scope is always the SIGNED-IN
 * RIDER'S OWN users.country — a national leaderboard is about a rider's own country's
 * community, not where any one ride physically happened.
 *
 * A rider who has not set a country yet, or who has never opened Statistics, sees an honest
 * empty/not-ranked state rather than a guessed number — see the empty-state renders below.
 *
 * Route:   /stats/leaderboard
 * Loads:   store/statisticsStore.ts -> GET /api/v1/statistics/leaderboard
 * Actions: category tabs; year select; "Where am I?" scrolls to my row when it is in the
 *          rendered list, or just re-confirms my rank (already shown on the button) when I am
 *          ranked outside it — the server sends only the top 50 plus my own row, not everyone.
 */

import { ChevronLeft, Flag, LocateFixed, RefreshCw, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { useMyIdentity } from "../app/useMyIdentity";
import {
  type LeaderboardCategory,
  leaderboardScopeKey,
  leaderboardSlot,
  useStatisticsStore,
} from "../store/statisticsStore";
import styles from "./StatisticsLeaderboardPage.module.css";
import shared from "./StatisticsShared.module.css";

const ICON_BASE = "/images/statistics/leaderboard";

const CATEGORY_META: Record<LeaderboardCategory, { label: string; unit: string; icon: string }> = {
  rides: { label: "Rides", unit: "rides", icon: `${ICON_BASE}/rides.svg` },
  distanceKm: { label: "Distance", unit: "km", icon: `${ICON_BASE}/distance.svg` },
  climbM: { label: "Climb", unit: "m", icon: `${ICON_BASE}/climb.svg` },
  hours: { label: "Hours", unit: "h", icon: `${ICON_BASE}/hours.svg` },
};

const CATEGORIES: LeaderboardCategory[] = ["rides", "distanceKm", "climbM", "hours"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
// Silver / gold / bronze left-to-right, gold centred and tallest — same order the reference
// podium uses.
const PODIUM_ORDER = [1, 0, 2];

export function StatisticsLeaderboardPage() {
  const me = useMyIdentity();
  const [category, setCategory] = useState<LeaderboardCategory>("rides");
  const [scope, setScope] = useState<"country" | "state">("country");
  const [year, setYear] = useState(YEARS[0]);

  const loadLeaderboard = useStatisticsStore((s) => s.loadLeaderboard);
  const scopeKey = leaderboardScopeKey(category, "year", year, undefined);
  const { data, loading } = useStatisticsStore(leaderboardSlot(scopeKey));

  useEffect(() => {
    if (me.userId != null) void loadLeaderboard(me.userId, category, "year", year, undefined);
  }, [me.userId, category, year, loadLeaderboard]);

  const unit = CATEGORY_META[category].unit;
  const rows = data?.top ?? [];
  const podium = [rows[0], rows[1], rows[2]];
  const rest = rows.slice(3);
  const currentRider = data?.me ?? null;
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
          {/* State/region has no real subdivision data yet — the select only relabels the
              scope for now; see the file header. */}
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
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              className={category === key ? styles.tabActive : styles.tab}
              onClick={() => setCategory(key)}
            >
              <img src={CATEGORY_META[key].icon} alt="" aria-hidden="true" />
              <span>{CATEGORY_META[key].label}</span>
            </button>
          ))}
        </div>
      </div>

      {data && data.country === "" ? (
        <div className={`card ${shared.emptyState}`}>
          <span className={shared.emptyIcon}>
            <Flag aria-hidden="true" />
          </span>
          <p className={shared.emptyTitle}>Set your country to see your leaderboard</p>
          <p className={shared.emptyBody}>
            The National Leaderboard ranks riders by country. Add yours on the account screen to
            join it.
          </p>
          <Link to="/account" className="button">
            Set my country
          </Link>
        </div>
      ) : loading && rows.length === 0 ? (
        <div className={shared.emptyState}>
          <span className={`${shared.emptyIcon} ${shared.emptyIconMuted}`}>
            <RefreshCw aria-hidden="true" />
          </span>
          <p className={shared.emptyTitle}>Loading the leaderboard…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className={`card ${shared.emptyState}`}>
          <span className={shared.emptyIcon}>
            <Trophy aria-hidden="true" />
          </span>
          <p className={shared.emptyTitle}>No champions yet</p>
          <p className={shared.emptyBody}>
            Nobody in your country has finished a ride yet — be the first name on this board.
          </p>
          <Link to="/" className="button">
            Find a ride
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.podium}>
            {PODIUM_ORDER.map((rowIndex, position) => {
              const row = podium[rowIndex];
              if (!row) return <div key={rowIndex} />;
              const place = position === 0 ? 2 : position === 1 ? 1 : 3;
              return (
                <article
                  key={row.userId}
                  className={styles.podiumSpot}
                  data-place={place}
                  data-me={row.userId === currentRider?.userId || undefined}
                >
                  <div className={styles.podiumRing}>
                    <Avatar
                      name={row.displayName}
                      avatarUrl={row.avatarUrl}
                      seed={String(row.userId)}
                      className={styles.podiumAvatar}
                    />
                  </div>
                  <strong className={styles.podiumPlace}>{place}</strong>
                  <h3 className={styles.podiumName}>{row.displayName}</h3>
                  <b className={styles.podiumValue}>
                    {row.value.toLocaleString()} {unit}
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
              <span>{CATEGORY_META[category].label}</span>
            </div>

            <div className={styles.listScroll}>
              {rest.map((row) => {
                const isMe = row.userId === currentRider?.userId;
                return (
                  <div
                    key={row.userId}
                    ref={isMe ? currentRowRef : undefined}
                    className={isMe ? styles.listRowMe : styles.listRow}
                  >
                    <span className={styles.listRank}>{row.rank}</span>
                    <Avatar
                      name={row.displayName}
                      avatarUrl={row.avatarUrl}
                      seed={String(row.userId)}
                      className={styles.listAvatar}
                    />
                    <span className={styles.listName}>
                      {row.displayName} <span aria-hidden="true">🇮🇱</span>
                    </span>
                    <span className={styles.listValue}>
                      {row.value.toLocaleString()} {unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

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
