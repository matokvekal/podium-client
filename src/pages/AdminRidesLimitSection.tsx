/**
 * "Rider limits" — the System Admin section on /admin2026 for raising (or lowering) the rider
 * cap of one upcoming ride without touching the organizer's account cap (server sql/060).
 *
 * Own load/error/forbidden state, like AdminRideImagesSection: its endpoints
 * (GET/PATCH /api/v1/admin/rides) sit behind the same requireAdminAnalytics gate.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type AdminRide,
  effectiveRideLimit,
  fetchAdminRides,
  formatRideStart,
  parseRiderLimitInput,
  setRideMaxParticipants,
} from "../lib/admin-rides";
import { ApiError } from "../lib/api-client";
import styles from "./AdminAnalyticsPage.module.css";
import sectionStyles from "./AdminRidesLimitSection.module.css";

type LoadState =
  | { phase: "loading" }
  | { phase: "ok"; rides: AdminRide[] }
  | { phase: "forbidden" }
  | { phase: "error"; message: string };

type RowNote = { kind: "saved" | "error"; text: string };

const TITLE = "Rider limits";

export function AdminRidesLimitSection() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  // What is typed in each row's Limit box, keyed by ride id; absent = shows the saved value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, RowNote>>({});

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const rides = await fetchAdminRides();
      setState({ phase: "ok", rides });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setState({ phase: "forbidden" });
        return;
      }
      setState({ phase: "error", message: "Could not load upcoming rides." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(ride: AdminRide, value: number | null) {
    setBusyId(ride.id);
    setNotes((n) => {
      const { [ride.id]: _, ...rest } = n;
      return rest;
    });
    try {
      const updated = await setRideMaxParticipants(ride.id, value);
      setState((s) =>
        s.phase === "ok"
          ? { ...s, rides: s.rides.map((r) => (r.id === updated.id ? updated : r)) }
          : s,
      );
      setDrafts((d) => {
        const { [ride.id]: _, ...rest } = d;
        return rest;
      });
      setNotes((n) => ({ ...n, [ride.id]: { kind: "saved", text: "Saved ✓" } }));
    } catch (err) {
      setNotes((n) => ({
        ...n,
        [ride.id]: { kind: "error", text: err instanceof ApiError ? err.message : "Save failed" },
      }));
    } finally {
      setBusyId(null);
    }
  }

  function handleSave(ride: AdminRide) {
    const parsed = parseRiderLimitInput(drafts[ride.id] ?? "");
    if (!parsed.ok) {
      setNotes((n) => ({ ...n, [ride.id]: { kind: "error", text: parsed.error } }));
      return;
    }
    void save(ride, parsed.value);
  }

  if (state.phase === "forbidden") return null; // the page-level "Access denied" already said it
  if (state.phase === "loading") {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>{TITLE}</h2>
        <p className={styles.empty}>Loading…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>{TITLE}</h2>
        <div className={styles.errorBox}>
          <p>{state.message}</p>
          <button type="button" className="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>
        {TITLE}{" "}
        <span className={styles.blockNote}>
          · upcoming rides — a per-ride limit replaces the organizer's account limit for that ride
          only
        </span>
      </h2>

      {state.rides.length === 0 ? (
        <p className={styles.empty}>No upcoming rides.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDate}>Ride</th>
                <th className={styles.thDate}>Date</th>
                <th className={styles.thDate}>Organizer</th>
                <th>Riders</th>
                <th>Account limit</th>
                <th>Ride limit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.rides.map((ride) => {
                const busy = busyId === ride.id;
                const note = notes[ride.id];
                const draft = drafts[ride.id];
                const limit = effectiveRideLimit(ride);
                return (
                  <tr key={ride.id}>
                    <td className={sectionStyles.rideCell}>
                      <Link to={`/events/${ride.id}`}>{ride.name}</Link>
                      <span className={sectionStyles.rideMeta}>
                        {ride.code} · {ride.status}
                      </span>
                    </td>
                    <td className={styles.tdDate}>{formatRideStart(ride.startsAt)}</td>
                    <td className={styles.tdDate}>{ride.ownerName ?? "—"}</td>
                    <td>
                      {ride.participantCount}
                      {limit !== null && ` / ${limit}`}
                    </td>
                    <td>{ride.ownerLimit ?? "—"}</td>
                    <td>
                      <input
                        className={`${sectionStyles.limitInput} ${
                          ride.maxParticipants !== null ? sectionStyles.overridden : ""
                        }`}
                        inputMode="numeric"
                        aria-label={`Rider limit for ${ride.name}`}
                        placeholder={ride.ownerLimit !== null ? String(ride.ownerLimit) : ""}
                        value={draft ?? ride.maxParticipants?.toString() ?? ""}
                        disabled={busy}
                        onChange={(e) => setDrafts((d) => ({ ...d, [ride.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft !== undefined) handleSave(ride);
                        }}
                      />
                    </td>
                    <td>
                      <div className={sectionStyles.rowActions}>
                        <button
                          type="button"
                          className="button"
                          disabled={busy || draft === undefined}
                          onClick={() => handleSave(ride)}
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        {ride.maxParticipants !== null && (
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            title="Go back to the organizer's account limit"
                            onClick={() => void save(ride, null)}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {note && (
                        <span
                          className={
                            note.kind === "error"
                              ? sectionStyles.rowError
                              : sectionStyles.rowMessage
                          }
                        >
                          {note.text}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
