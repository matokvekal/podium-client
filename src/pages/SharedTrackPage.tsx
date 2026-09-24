/**
 * One shared track — what a card's Share button sends.
 *
 * Route:  /mtb/:trackId, /gravel/:trackId, /road/:trackId   (lib/track-share-url.ts)
 * Open to everyone, like Find Tracks itself: the link must show the track to whoever opens it,
 * signed in or not. A rider who then signs in from the menu comes straight back here
 * (AppDrawer's goToLogin carries this address as `from`, LoginPage honours it).
 *
 * Loads:  GET /events/public?routeId=<id>&uniqueTracks=1&limit=1 — the SAME row Find Tracks
 *         shows for this track, so the card is identical (map, profile, trail facts, likes,
 *         heart, Ride it) and no second endpoint exists to drift from the list.
 *
 * The terrain word in the URL is a label only; the id decides what opens. A link whose terrain
 * no longer matches the track (the organizer changed discipline) is corrected in place.
 */

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { TrackGalleryCard } from "../app/TrackGalleryCard";
import { useAuth } from "../auth/AuthContext";
import { apiRequestPaged } from "../lib/api-client";
import { buildFindTracksPath } from "../lib/find-tracks-url";
import type { EventSummary } from "../lib/local-db";
import { trackHandoffState } from "../lib/track-handoff";
import { isShareTerrain, parseTrackId, trackSharePath } from "../lib/track-share-url";

type LoadState =
  | { kind: "loading" }
  | { kind: "found"; event: EventSummary }
  | { kind: "missing" }
  | { kind: "error" };

export function SharedTrackPage() {
  const { trackId: rawId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status } = useAuth();
  const trackId = parseTrackId(rawId);
  const terrain = pathname.split("/")[1];
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Wait for the session to settle, so a signed-in rider's card knows their like / heart.
  const authSettled = status !== "loading";
  const signedIn = status === "signed-in";

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is a deliberate re-run trigger for Try again.
  useEffect(() => {
    if (trackId == null || !authSettled) return;
    let cancelled = false;
    setState({ kind: "loading" });
    const params = new URLSearchParams({
      routeId: String(trackId),
      uniqueTracks: "1",
      sort: "newest",
      limit: "1",
    });
    apiRequestPaged<EventSummary>(`/events/public?${params.toString()}`, { anonymous: !signedIn })
      .then((page) => {
        if (cancelled) return;
        const event = page.data[0];
        setState(event ? { kind: "found", event } : { kind: "missing" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, authSettled, signedIn, attempt]);

  // Tab title follows the track, like Find Tracks' own.
  const title = state.kind === "found" ? state.event.name : null;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · El Niño Ride`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (trackId == null || !isShareTerrain(terrain)) return <Navigate to="/findtracks" replace />;

  if (state.kind === "found" && state.event.routeId != null) {
    const canonical = trackSharePath(state.event.activityType, state.event.routeId);
    if (canonical !== pathname) return <Navigate to={canonical} replace />;
  }

  const browseMore = buildFindTracksPath({ country: null, type: terrain });

  return (
    <section className="stack" style={{ maxWidth: 520, marginInline: "auto" }}>
      <Link to={browseMore} className="button button--quiet" style={{ alignSelf: "flex-start" }}>
        <ArrowLeft width={16} height={16} aria-hidden="true" />
        More tracks
      </Link>

      {state.kind === "loading" && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Loading track…
        </p>
      )}

      {state.kind === "missing" && (
        <p className="banner" role="alert">
          This track is no longer shared. <Link to={browseMore}>Browse other tracks</Link>
        </p>
      )}

      {state.kind === "error" && (
        <p className="banner banner--error" role="alert">
          Could not load this track.{" "}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </p>
      )}

      {state.kind === "found" && (
        <TrackGalleryCard
          event={state.event}
          anonymousDetail
          variant="page"
          onPick={(event) => navigate("/events/new", { state: trackHandoffState(event) })}
        />
      )}
    </section>
  );
}
