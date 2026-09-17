/**
 * Which ride are you riding?
 *
 * Route:    /share/:codes   (e.g. /share/19092026A-19092026B)
 * Loads:    GET /events/share/:codes — unauthenticated, so a stranger sees the rides before
 *           being asked who they are; then GET /events/:id/route?preview=1 per card
 * Actions:  pick a ride (→ the existing /join/:code flow), or switch off the one you joined
 * State:    the resolved group, per-card geometry, the move confirmation
 *
 * An organizer often creates two rides for one day — a long one and a short one that start
 * together. This is the page their single shared link opens: one card per ride, each with its
 * real map, and NOTHING PRE-SELECTED. Picking is the reader's job; that is the whole feature.
 *
 * WHY THIS PAGE JOINS NOTHING ITSELF
 *   Tapping a card goes to /join/:code — the page that has always handled an invitation. It
 *   records the invite, shows a signed-in rider the bib/confirm form, and sends a guest to the
 *   ride page with its "Sign in to join" CTA. Bib rules, approval rules, capacity and the
 *   sign-in detour therefore have exactly one implementation, and this page cannot drift from
 *   it. `?via` is carried through so lib/invite-greeting.ts still tells a scan from a
 *   forwarded link.
 *
 * SWITCHING RIDES MOVES YOU
 *   If the reader is already on one ride in this group and picks a different one, they are
 *   taken OFF the first — POST /events/:id/leave — before joining the second, so they are
 *   never counted on both start lists and the organizer's head-count stays honest. It is
 *   confirmed first, because leaving a ride is not what "switch" obviously means to everyone.
 *
 * DEGRADING IS NOT AN ERROR PATH, IT IS THE COMMON END STATE
 *   Groups shrink: the organizer removes a ride, or one of them finishes. The server answers
 *   with the group's CURRENT members, so a link in a chat from last week may resolve to one
 *   ride — and then this page steps out of the way and hands it to /join/:code, which is
 *   exactly where that link would have gone before the rides were ever connected.
 *
 * Open to guests (App.tsx), same as /join/:code: this is a front door, not a signed-in screen.
 */

import { ArrowRight, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar } from "../app/Avatar";
import { placeholderCoverGradient } from "../app/event-visuals";
import { projectTrack } from "../app/track-thumbnail";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";
import type { EventSummary } from "../lib/local-db";
import { regionLabel } from "../lib/regions";
import { formatLocalDate, formatLocalTime } from "../lib/time";
import { useEventsStore } from "../store/eventsStore";
import styles from "./SharedRidesPage.module.css";

const TrackMiniMap = lazy(() => import("../app/TrackMiniMap"));

/** The SVG underlay's coordinate space — same figures TrackGalleryCard uses. */
const THUMB_W = 320;
const THUMB_H = 150;
const THUMB_PAD = 8;

interface SharedOwner {
  id: number;
  name: string | null;
  avatarUrl?: string | null;
}

interface SharedRidesResponse {
  linkGroupId: string | null;
  owner: SharedOwner | null;
  rides: EventSummary[];
}

export function SharedRidesPage() {
  const { codes } = useParams();
  const [searchParams] = useSearchParams();
  const via = searchParams.get("via") === "qr" ? "qr" : null;
  const navigate = useNavigate();
  const { status } = useAuth();

  const joinedRideIds = useEventsStore((state) => state.joinedRideIds);
  const loadMyRides = useEventsStore((state) => state.loadMyRides);

  const [group, setGroup] = useState<SharedRidesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [routes, setRoutes] = useState<Map<string, EventRoute | null>>(new Map());
  const [moving, setMoving] = useState<EventSummary | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const inFlight = useRef(new Set<string>());

  // A signed-in reader needs their own joined set to know whether picking a second ride is a
  // move or a plain join. A guest has none, and needs none.
  useEffect(() => {
    if (status === "signed-in") void loadMyRides(true);
  }, [status, loadMyRides]);

  useEffect(() => {
    if (!codes) return;
    let cancelled = false;
    setError(null);
    setOffline(false);
    (async () => {
      try {
        const data = await apiRequest<SharedRidesResponse>(
          `/events/share/${encodeURIComponent(codes)}`,
          { anonymous: true },
        );
        if (cancelled) return;
        // One ride left in the group — hand it to the flow that has always handled a single
        // invitation. `replace`, so Back leaves the app rather than bouncing through here.
        if (data.rides.length === 1) {
          navigate(`/join/${encodeURIComponent(data.rides[0].code)}${via ? "?via=qr" : ""}`, {
            replace: true,
          });
          return;
        }
        setGroup(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isOffline) {
          setOffline(true);
          return;
        }
        setError(
          err instanceof ApiError && err.status === 404
            ? "That link doesn't point to any rides any more. Ask the organizer for a new one."
            : "Could not open that link right now.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [codes, navigate, via]);

  /**
   * Per-card geometry, the same shape useTrackGallery.requestRoute uses: fetched once per
   * ride, and settled either way — see the catch.
   *
   * ⚠ NOT `anonymous`, unlike the public gallery. A signed-in rider on a PRIVATE ride in this
   * group is entitled to its map, and dropping their token would hide it from them. There are
   * at most three cards here, so none of the 401-burst risk that made the gallery anonymous
   * applies. The endpoint runs the server's own getEventForViewer, so a stranger still gets
   * nothing for a private ride — this page cannot leak a map it should not show.
   */
  const requestRoute = useCallback((eventId: string) => {
    if (inFlight.current.has(eventId)) return;
    inFlight.current.add(eventId);
    (async () => {
      try {
        const route = await apiRequest<EventRoute | null>(`/events/${eventId}/route?preview=1`);
        setRoutes((prev) => new Map(prev).set(eventId, route));
      } catch {
        // ⚠ A FAILURE IS RECORDED, NOT LEFT BLANK. `undefined` in this map means "still
        //   loading" and draws a spinner, and nothing on this page ever asks a second time —
        //   the effect below runs when the GROUP changes, not on a timer. Leaving it unset
        //   therefore spun forever, which is exactly what a PRIVATE ride does here: its card
        //   is offered to whoever holds the link (server: getSharedRideGroup), while its
        //   geometry stays behind the ride's own rule and this request is refused. A card
        //   with its placeholder gradient is the honest answer; a spinner claims a map is
        //   coming that never will.
        setRoutes((prev) => new Map(prev).set(eventId, null));
      } finally {
        inFlight.current.delete(eventId);
      }
    })();
  }, []);

  useEffect(() => {
    for (const ride of group?.rides ?? []) requestRoute(ride.id);
  }, [group, requestRoute]);

  /** The ride in this group the reader is already on, if any. */
  const joinedHere = useMemo(
    () => group?.rides.find((ride) => joinedRideIds.includes(ride.id)) ?? null,
    [group, joinedRideIds],
  );

  const day = useMemo(
    () => group?.rides.map((ride) => ride.startsAt).find(Boolean) ?? null,
    [group],
  );

  function goToJoin(ride: EventSummary) {
    navigate(`/join/${encodeURIComponent(ride.code)}${via ? "?via=qr" : ""}`);
  }

  function pick(ride: EventSummary) {
    // Already on this one: nothing to move, just carry on to it.
    if (joinedHere && joinedHere.id !== ride.id) {
      setMoving(ride);
      return;
    }
    goToJoin(ride);
  }

  async function confirmMove() {
    if (!moving || !joinedHere) return;
    setMoveBusy(true);
    try {
      await apiRequest(`/events/${joinedHere.id}/leave`, { method: "POST" });
      // Refresh the joined set before leaving, so coming back here shows the truth rather
      // than the ride they just left.
      void loadMyRides(true);
      goToJoin(moving);
    } catch (err) {
      // The server's own wording is better than a generic retry line — it says WHY, e.g.
      // "This ride has finished — you can no longer leave it", which is a rule the rider needs
      // to understand rather than an error to retry.
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Could not move you off that ride. Try again, or leave it from its own page.",
      );
    } finally {
      setMoveBusy(false);
      setMoving(null);
    }
  }

  if (offline) {
    return (
      <section className="stack">
        <p className="banner banner--offline" role="status">
          You're offline. This link needs a connection the first time it's opened.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!group) {
    return (
      <section className="stack">
        <p className="muted">
          <span className="spinner" aria-hidden="true" /> Opening…
        </p>
      </section>
    );
  }

  const ownerName = group.owner?.name?.trim() || "An organizer";

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div className={styles.owner}>
          <Avatar
            name={group.owner?.name ?? null}
            avatarUrl={group.owner?.avatarUrl ?? null}
            seed={String(group.owner?.id ?? group.linkGroupId ?? "")}
            className={styles.ownerAvatar}
          />
          <div>
            <h1 className={styles.title}>
              {ownerName} created {group.rides.length} rides
            </h1>
            {day && <p className={styles.day}>{formatLocalDate(day)}</p>}
          </div>
        </div>
        <p className={styles.prompt}>Which one are you riding?</p>
      </header>

      <ul className={styles.list}>
        {group.rides.map((ride) => {
          const route = routes.get(ride.id);
          const projected = route ? projectTrack(route.points, THUMB_W, THUMB_H, THUMB_PAD) : null;
          const isMine = joinedHere?.id === ride.id;
          const distanceKm = route?.distanceKm ?? ride.distanceKm;
          const climbM = route?.elevationM ?? ride.elevationGain;
          const place = regionLabel(ride.region) || ride.location || ride.area;

          return (
            <li key={ride.id}>
              {/* The whole card is the control. Nothing is selected until it is pressed, and
                  there is no "continue" step — picking a ride IS the action. */}
              <button type="button" className={styles.card} onClick={() => pick(ride)}>
                <div className={styles.media}>
                  <div
                    className={styles.underlay}
                    style={{ background: placeholderCoverGradient(ride.id) }}
                    aria-hidden="true"
                  >
                    {projected && (
                      <svg
                        className={styles.underlaySvg}
                        viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden="true"
                      >
                        <polyline className={styles.trackCasing} points={projected.points} />
                        <polyline className={styles.trackLine} points={projected.points} />
                      </svg>
                    )}
                    {route === undefined && <span className="spinner" aria-hidden="true" />}
                  </div>
                  {route && route.points.length > 1 && (
                    <div className={styles.mapLayer}>
                      <Suspense fallback={null}>
                        <TrackMiniMap points={route.points} label={ride.name} />
                      </Suspense>
                    </div>
                  )}
                </div>

                <div className={styles.body}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{ride.name}</span>
                    {isMine && <span className="badge badge--live">You're in</span>}
                  </div>

                  <div className={styles.stats}>
                    {ride.startsAt && <span>{formatLocalTime(ride.startsAt)}</span>}
                    {distanceKm != null && <span>{Math.round(distanceKm)} km</span>}
                    {climbM != null && <span>{Math.round(climbM)} m climb</span>}
                    {ride.participantCount != null && (
                      <span>
                        <Users width={13} height={13} aria-hidden="true" /> {ride.participantCount}
                      </span>
                    )}
                  </div>

                  {place && <p className={styles.place}>{place}</p>}

                  <span className={styles.cta}>
                    {isMine ? "Open this ride" : "Choose this ride"}
                    <ArrowRight width={15} height={15} aria-hidden="true" />
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className={styles.footnote}>
        {joinedHere
          ? "You can switch any time from this link — you'll be moved off the ride you're on."
          : "Not sure yet? You can open this link again and change your mind."}
      </p>

      {/* Leaving a ride is not what "switch" obviously means to everyone, so it is said out
          loud before it happens rather than discovered on the organizer's start list. */}
      {moving && joinedHere && (
        <>
          <div
            className={styles.confirmOverlay}
            onClick={() => setMoving(null)}
            aria-hidden="true"
          />
          <div className={styles.confirm} role="dialog" aria-label="Switch ride">
            <p className={styles.confirmText}>
              You're on <strong>{joinedHere.name}</strong>. Switching to{" "}
              <strong>{moving.name}</strong> takes you off it.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className="button"
                disabled={moveBusy}
                onClick={() => void confirmMove()}
              >
                {moveBusy ? "Moving…" : `Move me to ${moving.name}`}
              </button>
              <button
                type="button"
                className="button button--quiet"
                disabled={moveBusy}
                onClick={() => setMoving(null)}
              >
                Stay on {joinedHere.name}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
