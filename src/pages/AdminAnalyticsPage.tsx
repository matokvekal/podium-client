/**
 * /admin2026 — the private analytics page. One administrator (checked SERVER-side against
 * env.ADMIN_ANALYTICS_EMAILS — the URL is not the gate). Reads GET /api/v1/admin/analytics and
 * renders it plainly: five headline numbers, a newest-first daily table, rides by visibility,
 * a per-country breakdown. Built for a ride organiser to open and understand El Niño in a few
 * seconds — no charts, no filters beyond a range preset, no BI.
 *
 * States: loading (skeleton, never zeros), error (message + Retry), 403 (Access denied), ok.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type AnalyticsRangeKey,
  type AnalyticsResponse,
  countryFlag,
  countryName,
  DEFAULT_RANGE,
  formatCount,
  formatDisplayDate,
  RANGE_OPTIONS,
  sortDailyNewestFirst,
} from "../lib/admin-analytics";
import { ApiError, apiRequest } from "../lib/api-client";
import styles from "./AdminAnalyticsPage.module.css";

type LoadState =
  | { phase: "loading" }
  | { phase: "ok"; data: AnalyticsResponse }
  | { phase: "forbidden" }
  | { phase: "error"; message: string };

export function AdminAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRangeKey>(DEFAULT_RANGE);
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async (r: AnalyticsRangeKey) => {
    setState({ phase: "loading" });
    try {
      const data = await apiRequest<AnalyticsResponse>(`/admin/analytics?range=${r}`);
      setState({ phase: "ok", data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setState({ phase: "forbidden" });
        return;
      }
      // 401 is handled upstream by RequireAuth (redirect to /login); anything else is a real
      // failure the operator can retry.
      setState({
        phase: "error",
        message:
          err instanceof ApiError && err.isOffline
            ? "You appear to be offline."
            : "Could not load analytics.",
      });
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  if (state.phase === "forbidden") {
    return (
      <div className={styles.center}>
        <h1 className={styles.deniedTitle}>Access denied</h1>
        <p className={styles.deniedText}>This page is for the El Niño administrator only.</p>
        <Link to="/" className="button button--quiet">
          Back to rides
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>El Niño Analytics</h1>
          {state.phase === "ok" && (
            <p className={styles.asOf}>
              as of {new Date(state.data.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <fieldset className={styles.rangeGroup} aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={styles.rangeBtn}
              data-active={range === opt.key || undefined}
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </fieldset>
      </header>

      {state.phase === "loading" && <Skeleton />}

      {state.phase === "error" && (
        <div className={styles.errorBox}>
          <p>{state.message}</p>
          <button type="button" className="button" onClick={() => void load(range)}>
            Retry
          </button>
        </div>
      )}

      {state.phase === "ok" && <Dashboard data={state.data} rangeKey={range} />}
    </div>
  );
}

function Dashboard({ data, rangeKey }: { data: AnalyticsResponse; rangeKey: AnalyticsRangeKey }) {
  const daily = sortDailyNewestFirst(data.daily);
  const rangeLabel =
    RANGE_OPTIONS.find((o) => o.key === rangeKey)?.label.toLowerCase() ?? "range";

  const cards: { label: string; value: number; hint?: string }[] = [
    { label: "Users", value: data.totals.users },
    { label: "Ride creators", value: data.totals.rideCreators },
    { label: "Rides", value: data.totals.rides },
    { label: "On start lists", value: data.totals.currentRegistrations, hint: "right now" },
    { label: "Countries", value: data.totals.countries },
  ];

  return (
    <>
      <section className={styles.cards} aria-label="Totals">
        {cards.map((c) => (
          <div key={c.label} className={styles.card}>
            <div className={styles.cardValue}>{formatCount(c.value)}</div>
            <div className={styles.cardLabel}>{c.label}</div>
            {c.hint && <div className={styles.cardHint}>{c.hint}</div>}
          </div>
        ))}
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>
          Daily activity <span className={styles.blockNote}>· last {rangeLabel}, newest first</span>
        </h2>
        {daily.length === 0 ? (
          <p className={styles.empty}>No activity in this range.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thDate}>Date</th>
                  <th>Users</th>
                  <th>Rides</th>
                  <th>Joins</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date}>
                    <td className={styles.tdDate}>{formatDisplayDate(row.date)}</td>
                    <td>{row.newUsers || <span className={styles.zero}>0</span>}</td>
                    <td>{row.newRides || <span className={styles.zero}>0</span>}</td>
                    <td>{row.newParticipants || <span className={styles.zero}>0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Rides by visibility</h2>
        <div className={styles.visRow}>
          <VisStat label="Public" value={data.rides.public} total={data.totals.rides} tone="live" />
          <VisStat
            label="Registered"
            value={data.rides.registered}
            total={data.totals.rides}
            tone="pending"
          />
          <VisStat
            label="Private"
            value={data.rides.private}
            total={data.totals.rides}
            tone="finished"
          />
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Routes</h2>
        <div className={styles.routeGrid}>
          <RouteStat label="Created" value={data.routes.created} />
          <RouteStat label="From GPX" value={data.routes.fromGpx} />
          <RouteStat label="Other methods" value={data.routes.otherMethods} />
          <RouteStat label="Copies / reuses" value={data.routes.copies} accent />
          <RouteStat label="Distinct copiers" value={data.routes.distinctCopiers} accent />
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>
          Countries
          {data.totals.countries === 0 && (
            <span className={styles.blockNote}> · not stored yet</span>
          )}
        </h2>
        {data.countries.length === 0 ? (
          <p className={styles.empty}>
            No country data. Run <code>sql/030-country.sql</code> on the database.
          </p>
        ) : (
          <ul className={styles.countryList}>
            {data.countries.map((c) => (
              <li key={c.countryCode} className={styles.countryRow}>
                <span className={styles.countryName}>
                  <span aria-hidden="true">{countryFlag(c.countryCode)}</span>{" "}
                  {countryName(c.countryCode)}
                </span>
                <span className={styles.countryStats}>
                  <span>
                    <strong>{formatCount(c.rides)}</strong> rides
                  </span>
                  <span className={styles.countryUsers}>
                    <strong>{formatCount(c.users)}</strong> users
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={styles.footNote}>
        Totals are all-time. “Joins” counts every start-list entry ever
        ({formatCount(data.totals.historicalJoins)} total); “on start lists” is who is
        registered right now.
      </p>
    </>
  );
}

function VisStat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "live" | "pending" | "finished";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={styles.visStat} data-tone={tone}>
      <div className={styles.visValue}>{formatCount(value)}</div>
      <div className={styles.visLabel}>{label}</div>
      <div className={styles.visBarTrack}>
        <div className={styles.visBar} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.visPct}>{pct}%</div>
    </div>
  );
}

function RouteStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className={styles.routeStat} data-accent={accent || undefined}>
      <div className={styles.routeValue}>{formatCount(value)}</div>
      <div className={styles.routeLabel}>{label}</div>
    </div>
  );
}

const SKEL_CARDS = ["c1", "c2", "c3", "c4", "c5"];
const SKEL_ROWS = ["r1", "r2", "r3", "r4", "r5", "r6"];

function Skeleton() {
  return (
    <output className={styles.skeleton} aria-label="Loading analytics">
      <div className={styles.cards}>
        {SKEL_CARDS.map((k) => (
          <div key={k} className={`${styles.card} ${styles.skel}`}>
            <div className={`${styles.skelBar} ${styles.skelBarLg}`} />
            <div className={styles.skelBar} />
          </div>
        ))}
      </div>
      <div className={styles.block}>
        <div className={`${styles.skelBar} ${styles.skelBarMd}`} />
        {SKEL_ROWS.map((k) => (
          <div key={k} className={`${styles.skelBar} ${styles.skelRow}`} />
        ))}
      </div>
    </output>
  );
}
