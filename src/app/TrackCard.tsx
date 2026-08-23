/**
 * One public route in Find Tracks.
 *
 * Rewritten to render REAL fields only. The previous card showed an air-quality badge, a
 * hazard count, point-of-interest counts, a descent figure, a multi-day tag, a like counter
 * and a comment thread — none of which has a server field. They came from the hand-written
 * mock library and survived its deletion as type-shaped holes. Every one is gone rather than
 * defaulted, because a fabricated air-quality or hazard reading on a route someone is about to
 * ride is a safety claim this app cannot back up.
 *
 * What GET /routes/public actually provides, and therefore what can appear here:
 *   name · route type · place · distance · climb · owner · a preview line for the thumbnail
 *
 * Each is rendered only when the server sent a real value, so a sparse route degrades to a
 * smaller card rather than a card full of dashes. There is no country flag: routes carry a
 * free-text `placeName` and no country column.
 *
 * "Plan a ride with this track" used to be a bare <Link to="/events/new"> that handed over
 * nothing at all — the picked route was dropped on the floor and the create page opened empty.
 * It now passes the route id and its reusable metadata through router state.
 */

import { Mountain, Ruler, Route as RouteIcon, MapPin, Heart, User } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  type PublicRoute,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_TO_SURFACE,
} from "../lib/track-types";
import styles from "./TrackCard.module.css";

const RouteMap = lazy(() => import("./RouteMap"));

interface TrackCardProps {
  track: PublicRoute;
  favorite: boolean;
  onToggleFavorite(id: number): void;
}

export function TrackCard({ track, favorite, onToggleFavorite }: TrackCardProps) {
  const typeLabel = track.routeType ? ROUTE_TYPE_LABEL[track.routeType] : null;
  // Only a route type that also exists as an event activity type is worth handing over; a
  // "mixed" route has no event equivalent, so the create form is left to ask.
  const surface = track.routeType ? ROUTE_TYPE_TO_SURFACE[track.routeType] : undefined;
  const preview = track.previewPoints?.length ? track.previewPoints : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {typeLabel && <span className={styles.surfaceTag}>{typeLabel}</span>}
        </div>
        <button
          type="button"
          className={favorite ? `${styles.favBtn} ${styles.favActive}` : styles.favBtn}
          onClick={() => onToggleFavorite(track.id)}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart width={16} height={16} fill={favorite ? "currentColor" : "none"} strokeWidth={2} />
        </button>
      </div>

      {/* An unnamed route is real and still usable — it just shows its place, or nothing. */}
      {track.name?.trim() && <h3 className={styles.name}>{track.name}</h3>}

      {track.placeName?.trim() && (
        <p className={styles.place}>
          <MapPin className={styles.tagIcon} aria-hidden="true" />
          {track.placeName}
        </p>
      )}

      {preview && (
        <Suspense fallback={<div className="row muted">Loading the map…</div>}>
          <RouteMap points={preview} />
        </Suspense>
      )}

      {(track.distanceKm != null || track.elevationM != null) && (
        <div className={styles.stats}>
          {track.distanceKm != null && (
            <span className={styles.stat}>
              <Ruler className={styles.tagIcon} aria-hidden="true" />
              {track.distanceKm} km
            </span>
          )}
          {track.elevationM != null && (
            <span className={styles.stat}>
              <Mountain className={styles.tagIcon} aria-hidden="true" />
              {track.elevationM} m
            </span>
          )}
          {track.pointCount != null && (
            <span className={styles.stat}>
              <RouteIcon className={styles.tagIcon} aria-hidden="true" />
              {track.pointCount} points
            </span>
          )}
        </div>
      )}

      {track.ownerName?.trim() && (
        <p className={styles.owner}>
          <User className={styles.tagIcon} aria-hidden="true" />
          {track.ownerName}
        </p>
      )}

      {/* The handoff. `routeId` is what the create page attaches with — the server's
          POST /events/:eventId/route accepts { routeId } and links this very row, so the new
          ride runs on the real route rather than a copy of its geometry. */}
      <Link
        className={styles.planBtn}
        to="/events/new"
        state={{
          fromRouteId: track.id,
          fromRouteName: track.name,
          fromRoutePlace: track.placeName,
          fromRouteDistanceKm: track.distanceKm,
          fromRouteClimbM: track.elevationM,
          fromRouteSurface: surface ?? null,
        }}
      >
        Plan a ride with this track
      </Link>
    </div>
  );
}
