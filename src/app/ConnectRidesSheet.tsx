/**
 * "Connect rides" — the organizer picks which of their OWN rides that day share one link.
 *
 * Opened from the organizer action sheet on EventDetailPage. Ticking a ride and saving GIVES
 * this ride a second link — `/share/<codeA>-<codeB>`, which opens a chooser — alongside the
 * `/join/<code>` it already had. ShareEventSheet then offers both and the organizer picks per
 * message; connecting rides never takes the single-ride link away, which is why this sheet
 * says so out loud. The rides themselves are not merged, moved or altered in any way —
 * participants, results, live tracking and ride groups are all untouched. Only the LINKS
 * change. See server sql/037-event-link-groups.sql.
 *
 * WHY THE CANDIDATES COME OUT OF THE STORE AND NOT AN ENDPOINT
 *   `eventsStore.myRides` already holds everything GET /events?filter=mine returns, and the
 *   filter "mine, that day, not this one, not over" is three lines of predicate. A dedicated
 *   endpoint would be a second definition of the same question.
 *
 *   It does call loadMyRides() on open, though: myRides is populated by EventsListPage and by
 *   sign-in, not by EventDetailPage, so an organizer who opened this ride from a link or a
 *   bookmark has an empty store and would otherwise be told they have no other rides that day.
 *
 * WHY "SAME DAY" IS DECIDED HERE AND NOT BY THE SERVER
 *   Only the browser knows the organizer's timezone. lib/time.ts isSameLocalDay answers it
 *   exactly; the server enforces a coarse 24-hour span because a UTC date comparison would be
 *   wrong by construction for some regions. Client validation is UX, the server is the
 *   authority on what it can actually know — and it will still refuse a bad set.
 *
 * Same bottom-sheet pattern as SafetySheet / CopyTrackSheet: portal, overlay, slide-up panel,
 * Escape to close.
 */

import { Check, Link2, Unlink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import type { EventSummary } from "../lib/local-db";
import { formatLocalDate, formatLocalTime, isSameLocalDay } from "../lib/time";
import { useEventsStore } from "../store/eventsStore";
import styles from "./ConnectRidesSheet.module.css";

/** Server ceiling (MAX_LINK_GROUP_RIDES) minus this ride. The server re-checks it. */
const MAX_OTHERS = 2;

/** Rides that are over are not offerable: nobody can join them from a chooser. */
const UNJOINABLE: EventSummary["status"][] = ["finished", "cancelled"];

interface ConnectRidesSheetProps {
  /** The ride whose share link this is about — the anchor of the group. */
  event: {
    id: string;
    name: string;
    startsAt: string | null;
    linkedRides?: { eventId: string; code: string; name: string; startsAt: string | null }[];
  };
  /** Called after a successful save or unlink, so the page can refetch the ride and pick up
   *  its new `linkedRides`. */
  onSaved: () => void;
  onClose: () => void;
}

export function ConnectRidesSheet({ event, onSaved, onClose }: ConnectRidesSheetProps) {
  const { profile } = useAuth();
  const myRides = useEventsStore((state) => state.myRides);
  const loadMyRides = useEventsStore((state) => state.loadMyRides);
  const upsertRide = useEventsStore((state) => state.upsertRide);

  const alreadyLinked = useMemo(
    () => (event.linkedRides ?? []).map((ride) => ride.eventId),
    [event.linkedRides],
  );
  const [selected, setSelected] = useState<string[]>(alreadyLinked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // See the header note: a deep-linked organizer has an empty store.
  useEffect(() => {
    void loadMyRides(true);
  }, [loadMyRides]);

  const candidates = useMemo(() => {
    const myId = profile?.id;
    if (myId == null) return [];
    return myRides
      .filter(
        (ride) =>
          ride.id !== event.id &&
          ride.ownerId === myId &&
          !UNJOINABLE.includes(ride.status) &&
          isSameLocalDay(ride.startsAt, event.startsAt),
      )
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  }, [myRides, profile?.id, event.id, event.startsAt]);

  function toggle(rideId: string) {
    setError(null);
    setSelected((current) => {
      if (current.includes(rideId)) return current.filter((id) => id !== rideId);
      if (current.length >= MAX_OTHERS) return current;
      return [...current, rideId];
    });
  }

  /**
   * `ids` is passed in rather than read off state: "Disconnect" clears the selection and saves
   * in the same handler, and a save that read `selected` would still see the old value on that
   * render.
   */
  const save = useCallback(
    async (ids: string[]) => {
      setBusy(true);
      setError(null);
      try {
        // An empty selection IS "share this ride on its own", so the two directions are one
        // action with two verbs — DELETE carries no body, which is why the method is chosen
        // here rather than always PUTting an empty list.
        const response = await apiRequest<{ rides: EventSummary[] }>(
          `/events/${event.id}/link-group`,
          ids.length > 0 ? { method: "PUT", body: { eventIds: ids } } : { method: "DELETE" },
        );
        // Keep the store honest straight away — the Created list marks connected rides from
        // linkGroupId, and waiting for the next loadMyRides would leave it stale.
        for (const ride of response.rides ?? []) upsertRide(ride);
        onSaved();
        onClose();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? // The server's 400s say exactly what is wrong ("Rides sharing one link have to
              // be on the same day"), and its wording beats a generic retry message.
              err.message || "Could not save that right now."
            : "Could not save that right now.",
        );
      } finally {
        setBusy(false);
      }
    },
    [event.id, upsertRide, onSaved, onClose],
  );

  const day = event.startsAt ? formatLocalDate(event.startsAt) : null;
  const unchanged =
    selected.length === alreadyLinked.length && selected.every((id) => alreadyLinked.includes(id));

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        className={`${styles.sheet} ${styles.sheetOpen}`}
        role="dialog"
        aria-label="Connect rides into one share link"
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <Link2 aria-hidden="true" className={styles.headerIcon} />
            Connect rides
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            Pick your other rides{day ? ` on ${day}` : " that day"} to connect to{" "}
            <strong>{event.name}</strong>. They stay separate rides — connecting them only adds a
            second link you can send: one that shows all of them and lets each rider choose.
          </p>
          <p className={styles.introNote}>
            You keep the link to <strong>{event.name}</strong> on its own — Share offers both.
          </p>

          {!event.startsAt && (
            <p className="banner banner--error" role="alert">
              This ride needs a start time before it can share a link with another ride.
            </p>
          )}

          {event.startsAt && candidates.length === 0 && (
            <p className={styles.empty}>
              You have no other ride{day ? ` on ${day}` : " that day"} yet. Rides can only share a
              link when they're on the same day.
            </p>
          )}

          {candidates.length > 0 && (
            <ul className={styles.list}>
              {candidates.map((ride) => {
                const isChecked = selected.includes(ride.id);
                // A ride can be left unselectable by the cap — shown, not hidden, so the
                // organizer can see what they would have to untick first.
                const atCap = !isChecked && selected.length >= MAX_OTHERS;
                return (
                  <li key={ride.id}>
                    <label className={`${styles.row} ${atCap ? styles.rowDisabled : ""}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={atCap || busy}
                        onChange={() => toggle(ride.id)}
                      />
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{ride.name}</span>
                        <span className={styles.rowMeta}>
                          {ride.startsAt ? formatLocalTime(ride.startsAt) : "no start time"}
                          {ride.distanceKm != null ? ` · ${Math.round(ride.distanceKm)} km` : ""}
                        </span>
                      </span>
                      {isChecked && <Check aria-hidden="true" className={styles.rowCheck} />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {candidates.length > 0 && (
            <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Up to {MAX_OTHERS} other rides.
            </p>
          )}

          {error && (
            <p className="banner banner--error" role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className="button"
              disabled={busy || unchanged || !event.startsAt}
              onClick={() => void save(selected)}
            >
              {busy
                ? "Saving…"
                : selected.length > 0
                  ? `Connect ${selected.length + 1} rides`
                  : "Save"}
            </button>
            {alreadyLinked.length > 0 && (
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => {
                  setSelected([]);
                  // Straight through rather than making them press Save afterwards: they asked
                  // for this ride on its own, and an empty set is exactly that request.
                  void save([]);
                }}
              >
                <Unlink width={16} height={16} aria-hidden="true" style={{ marginRight: 6 }} />
                Disconnect — no shared link at all
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
