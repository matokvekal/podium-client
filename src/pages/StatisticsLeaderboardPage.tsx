/**
 * National Leaderboard. Route: /stats/leaderboard.
 *
 * REAL DATA: reads useStatisticsStore (GET /api/v1/statistics/leaderboard), cache-first via
 * local-db.ts.
 *
 * LAYOUT REBUILT to the approved "National Champions" reference (board.JPG), which the previous
 * version only loosely resembled: brand mark + centred title + country pill on one row; four
 * category cards each carrying a sub-label ("Total km", "Total time", …); a three-pill filter row
 * (scope / year / rider set); a real podium — crown, laurel wreath, tiered pedestals, rank medal —
 * over the header photo; the ranked table with its own #/Rider/<category> columns and the "…"
 * break; and the rider's own row pinned at the bottom as a green card (this replaces the floating
 * "Where am I?" button, which the reference does not have and which hid rows behind it).
 *
 * Category ORDER follows the reference (Distance, Hours, Rides, Climb) and Distance is the
 * default, which is what the reference shows selected. Still exactly four, still no Calories —
 * that was asked for directly (calories stay on the rider's personal Statistics screen).
 *
 * PLACEHOLDER ART, ON PURPOSE: everything in public/images/statistics/leaderboard/ is a small
 * hand-drawn stand-in SVG, not the reference's photography, and the crown/laurel/pedestals below
 * are drawn in SVG + CSS rather than using its 3D renders. Drop real assets in at those same
 * paths and the layout takes them without markup changes.
 *
 * COUNTRY, NOT STATE: the scope select's "State / Region" option is left in but does not change
 * the query — there is no per-state subdivision data anywhere in the schema yet (see the
 * architecture note in statistics.service.ts). The country scope is always the SIGNED-IN RIDER'S
 * OWN users.country — a national leaderboard is about a rider's own country's community, not
 * where any one ride physically happened. Likewise the "All Riders" pill has exactly one option:
 * no rider-segment concept (age group, club, gender) exists yet, so it states the scope rather
 * than pretending to filter.
 *
 * A rider who has not set a country yet, or who has never opened Statistics, sees an honest
 * empty/not-ranked state rather than a guessed number — see the empty-state renders below.
 *
 * Route:   /stats/leaderboard
 * Loads:   store/statisticsStore.ts -> GET /api/v1/statistics/leaderboard
 * Actions: category cards; scope/year/rider-set pills; tapping my own row scrolls to it in the
 *          table when it is actually in the rendered list (the server sends only the top 50 plus
 *          my own row, not everyone).
 */

import { ChevronLeft, Flag, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { useMyIdentity } from "../app/useMyIdentity";
import { COUNTRIES, FALLBACK_COUNTRY_CODE } from "../lib/countries";
import { countryFlagEmoji } from "../lib/country-flag";
import { MOCK_LEADERBOARD_ENTRIES, MOCK_LEADERBOARD_ME } from "../lib/rider-stats-mock";
import {
  type LeaderboardCategory,
  leaderboardScopeKey,
  leaderboardSlot,
  useStatisticsStore,
} from "../store/statisticsStore";
import { MockDataNotice } from "./MockDataBadge";
import styles from "./StatisticsLeaderboardPage.module.css";
import shared from "./StatisticsShared.module.css";

const ICON_BASE = "/images/statistics/leaderboard";

const CATEGORY_META: Record<
  LeaderboardCategory,
  { label: string; sub: string; unit: string; icon: string }
> = {
  distanceKm: {
    label: "Distance",
    sub: "Total km",
    unit: "km",
    icon: `${ICON_BASE}/distance.svg`,
  },
  hours: { label: "Hours", sub: "Total time", unit: "h", icon: `${ICON_BASE}/hours.svg` },
  rides: { label: "Rides", sub: "Total rides", unit: "rides", icon: `${ICON_BASE}/rides.svg` },
  climbM: {
    label: "Climb",
    sub: "Total ascent (m)",
    unit: "m",
    icon: `${ICON_BASE}/climb.svg`,
  },
};

/** Reference order, left to right. Distance leads and is the default selection. */
const CATEGORIES: LeaderboardCategory[] = ["distanceKm", "hours", "rides", "climbM"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
// Silver / gold / bronze left-to-right, gold centred and tallest — same order the reference
// podium uses. Values index into the top-three rows.
const PODIUM_ORDER = [1, 0, 2];

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function StatisticsLeaderboardPage() {
  const me = useMyIdentity();
  const [category, setCategory] = useState<LeaderboardCategory>("distanceKm");
  const [scope, setScope] = useState<"country" | "state">("country");
  const [year, setYear] = useState(YEARS[0]);

  const loadLeaderboard = useStatisticsStore((s) => s.loadLeaderboard);
  const scopeKey = leaderboardScopeKey(category, "year", year, undefined);
  const { data, loading } = useStatisticsStore(leaderboardSlot(scopeKey));

  useEffect(() => {
    if (me.userId != null) void loadLeaderboard(me.userId, category, "year", year, undefined);
  }, [me.userId, category, year, loadLeaderboard]);

  const meta = CATEGORY_META[category];
  const noCountry = data != null && data.country === "";
  const hasRealRows = (data?.top.length ?? 0) > 0;
  // While the real backend has nothing to show for this scope (no ranked riders yet, or the
  // migrations behind it haven't run anywhere yet so the fetch itself failed), show sample rows
  // instead of a bare page — always with MockDataNotice visible, never mistakeable for real
  // rankings. See MockDataBadge.tsx's own header: delete this fallback the moment the real
  // leaderboard can be non-empty on its own.
  const usingMock = !loading && !noCountry && !hasRealRows;
  const rows = usingMock ? MOCK_LEADERBOARD_ENTRIES[category] : (data?.top ?? []);
  const podium = [rows[0], rows[1], rows[2]];
  const rest = rows.slice(3);
  const currentRider = usingMock ? MOCK_LEADERBOARD_ME[category] : (data?.me ?? null);

  // The country is whatever the server ranked this rider in; only fall back while nothing has
  // loaded yet, so the header never sits blank on first paint.
  const code = data?.country || (usingMock ? FALLBACK_COUNTRY_CODE : "");
  const flag = countryFlagEmoji(code);

  // "74 km to #326" is only honest when the rider one place above is actually in the payload —
  // the server sends the top 50 plus my own row, so for a rank deep in the field there is
  // nothing to subtract and the delta is simply left out.
  const aheadOfMe =
    currentRider != null ? rows.find((r) => r.rank === currentRider.rank - 1) : undefined;
  const meIsInList = currentRider != null && rest.some((r) => r.userId === currentRider.userId);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  function scrollToMe() {
    currentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function formatValue(value: number): string {
    return `${value.toLocaleString()} ${meta.unit}`;
  }

  return (
    <div className="stack">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.brand}>
            <Link to="/stats" className={styles.backBtn} aria-label="Back to Statistics">
              <ChevronLeft width={18} height={18} aria-hidden="true" />
            </Link>
            <img src="/logo.png" alt="El Niño" className={styles.brandLogo} />
          </div>

          <div className={styles.titleBlock}>
            <h1 className={styles.title}>
              National Champions
              <img src={`${ICON_BASE}/trophy.svg`} alt="" aria-hidden="true" />
            </h1>
            <p className={styles.subtitle}>
              {code ? `${countryName(code)} · ` : ""}
              {year} · All Riders
            </p>
          </div>

          <span className={styles.countryPill}>
            <span aria-hidden="true">{flag}</span>
            <span>{code ? countryName(code) : "—"}</span>
          </span>
        </div>

        <div className={styles.categories} role="tablist" aria-label="Leaderboard category">
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              className={category === key ? styles.categoryCardActive : styles.categoryCard}
              onClick={() => setCategory(key)}
            >
              <img src={CATEGORY_META[key].icon} alt="" aria-hidden="true" />
              <span className={styles.categoryLabel}>{CATEGORY_META[key].label}</span>
              <span className={styles.categorySub}>{CATEGORY_META[key].sub}</span>
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          {/* State/region has no real subdivision data yet — the select only relabels the scope
              for now; see the file header. */}
          <select
            className={styles.filterSelect}
            value={scope}
            onChange={(e) => setScope(e.target.value as "country" | "state")}
            aria-label="Championship scope"
          >
            <option value="country">📍 {code ? `${countryName(code)} (All)` : "All"}</option>
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
          {/* One option on purpose — no rider-segment data exists to filter by. */}
          <select className={styles.filterSelect} value="all" aria-label="Rider set" disabled>
            <option value="all">All Riders</option>
          </select>
        </div>
      </header>

      {noCountry ? (
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
      ) : (
        <>
          {usingMock && (
            <MockDataNotice>
              Sample rankings — nobody in your country is ranked here yet.
            </MockDataNotice>
          )}

          <section className={styles.podiumStage}>
            <p className={styles.script} aria-hidden="true">
              <span>Stronger</span>
              <span>Riders</span>
              <span>Brighter</span>
              <span>Days</span>
              <i className={styles.scriptUnderline} />
            </p>

            <div className={styles.podium}>
              {PODIUM_ORDER.map((rowIndex, position) => {
                const row = podium[rowIndex];
                const place = position === 0 ? 2 : position === 1 ? 1 : 3;
                if (!row) return <div key={place} />;
                return (
                  <article
                    key={row.userId}
                    className={styles.podiumSpot}
                    data-place={place}
                    data-me={row.userId === currentRider?.userId || undefined}
                  >
                    <div className={styles.podiumHead}>
                      <CrownIcon className={styles.crown} />
                      <LaurelIcon className={styles.laurel} />
                      <div className={styles.podiumRing}>
                        <Avatar
                          name={row.displayName}
                          avatarUrl={row.avatarUrl}
                          seed={String(row.userId)}
                          className={styles.podiumAvatar}
                        />
                      </div>
                    </div>

                    <div className={styles.pedestal}>
                      <strong className={styles.podiumPlace}>{place}</strong>
                      <h3 className={styles.podiumName}>{row.displayName}</h3>
                      <b className={styles.podiumValue}>{formatValue(row.value)}</b>
                      <small aria-hidden="true">{flag}</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHeader}>
              <span>#</span>
              <span className={styles.listHeaderRider}>Rider</span>
              <span>{meta.label}</span>
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
                    <span className={styles.listFlag} aria-hidden="true">
                      {flag}
                    </span>
                    <span className={styles.listName}>{row.displayName}</span>
                    <span className={styles.listValue}>{formatValue(row.value)}</span>
                  </div>
                );
              })}
            </div>

            {currentRider != null && !meIsInList && (
              <div className={styles.listBreak} aria-hidden="true">
                • • •
              </div>
            )}
          </section>

          {currentRider != null && (
            <MyRankCard
              rank={currentRider.rank}
              name={me.displayName}
              avatarUrl={me.avatarUrl}
              seed={me.seed ?? String(currentRider.userId)}
              flag={flag}
              value={formatValue(currentRider.value)}
              delta={
                aheadOfMe
                  ? `${formatValue(aheadOfMe.value - currentRider.value)} to #${aheadOfMe.rank}`
                  : null
              }
              onScrollToMe={meIsInList ? scrollToMe : null}
            />
          )}
        </>
      )}
    </div>
  );
}

/** The reference's green "this is you" card, pinned under the table. It is a button only when
 *  there is somewhere to jump to — my own row is in the rendered top-50 — so the chevron never
 *  promises a navigation that does nothing. */
function MyRankCard({
  rank,
  name,
  avatarUrl,
  seed,
  flag,
  value,
  delta,
  onScrollToMe,
}: {
  rank: number;
  name: string;
  avatarUrl: string | null;
  seed: string;
  flag: string;
  value: string;
  delta: string | null;
  onScrollToMe: (() => void) | null;
}) {
  const body = (
    <>
      <span className={styles.meRank}>{rank}</span>
      <Avatar name={name} avatarUrl={avatarUrl} seed={seed} className={styles.meAvatar} />
      <span className={styles.listFlag} aria-hidden="true">
        {flag}
      </span>
      <span className={styles.meCopy}>
        <b>{name}</b>
        <span>{value}</span>
      </span>
      {delta && (
        <span className={styles.meDelta}>
          <ArrowUpIcon />
          <span>{delta}</span>
        </span>
      )}
      {onScrollToMe && <ChevronRightIcon className={styles.meChevron} />}
    </>
  );

  return onScrollToMe ? (
    <button type="button" className={styles.meCard} onClick={onScrollToMe}>
      {body}
    </button>
  ) : (
    <div className={styles.meCard}>{body}</div>
  );
}

/* ------------------------------------------------------------
 * Podium ornaments. The reference uses 3D renders; these are flat SVG stand-ins holding the
 * same positions, so swapping in real art is a src change and nothing else.
 * ------------------------------------------------------------ */

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden="true">
      <path d="M4 27 2 8l11 7L24 3l11 12 11-7-2 19H4Z" />
      <circle cx="2.5" cy="6.5" r="2.5" />
      <circle cx="24" cy="2.5" r="2.5" />
      <circle cx="45.5" cy="6.5" r="2.5" />
    </svg>
  );
}

function LaurelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <g>
        <path
          d="M50 96C26 92 10 74 10 50 10 32 18 16 30 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {[18, 30, 42, 54, 66, 78].map((offset, i) => (
          <ellipse
            key={offset}
            cx={16 + i * 1.4}
            cy={offset}
            rx="7"
            ry="3.6"
            fill="currentColor"
            transform={`rotate(${-62 + i * 9} ${16 + i * 1.4} ${offset})`}
          />
        ))}
      </g>
      <g transform="translate(100 0) scale(-1 1)">
        <path
          d="M50 96C26 92 10 74 10 50 10 32 18 16 30 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {[18, 30, 42, 54, 66, 78].map((offset, i) => (
          <ellipse
            key={offset}
            cx={16 + i * 1.4}
            cy={offset}
            rx="7"
            ry="3.6"
            fill="currentColor"
            transform={`rotate(${-62 + i * 9} ${16 + i * 1.4} ${offset})`}
          />
        ))}
      </g>
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V5m0 0-6 6m6-6 6 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
