/**
 * One track shown as a single full card in the "Find Tracks" results pager — not a list row
 * like EventCard, since results are browsed one at a time (prev/next, not scrolled).
 *
 * Hazard display rule, set deliberately: only a "high" severity hazard is ever shown, as a
 * plain red alert, and only because a rider reported it — never a green/good sign for a
 * track with no reports. Absence of a report is not evidence a road is safe, just that no
 * one has said anything yet; showing a positive signal for that would be a false safety
 * claim. Low/medium hazards stay in the data (useful later, e.g. a detail view) but are not
 * surfaced here. The disclaimer text is intentional, not filler — see the note this pairs
 * with in plan/09-nfr-privacy-testing.md about versioned consent/terms: hazard content is
 * rider-reported, not verified or an app recommendation, and that needs to be reflected in
 * the app's terms once that system exists (it doesn't yet — see 09's "Reuse" section).
 */

import {
  AlertTriangle,
  Bath,
  Building2,
  CalendarDays,
  Coffee,
  Fuel,
  Heart,
  MessageCircle,
  Mountain,
  Ruler,
  ShoppingBag,
  ThumbsUp,
  TrendingDown,
  Wind,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { countryFlagEmoji } from "../lib/country-flag";
import type { Track } from "../lib/mock-tracks";
import { formatAge } from "../lib/time";
import styles from "./TrackCard.module.css";

const SURFACE_LABEL: Record<Track["surfaceType"], string> = {
  road: "Road",
  gravel: "Gravel",
  mtb: "MTB",
  running: "Running",
  hiking: "Hiking",
};

const AQI_TONE: Record<Track["airQuality"]["label"], string> = {
  Good: styles.aqiGood,
  Moderate: styles.aqiModerate,
  Unhealthy: styles.aqiUnhealthy,
};

const POI_LABEL: Record<Track["pois"][number]["type"], string> = {
  gas: "Gas",
  toilet: "Restroom",
  motel: "Lodging",
  shop: "Bike shop",
  rest: "Rest stop",
};

const POI_ICON: Record<Track["pois"][number]["type"], typeof Fuel> = {
  gas: Fuel,
  toilet: Bath,
  motel: Building2,
  shop: ShoppingBag,
  rest: Coffee,
};

interface TrackCardProps {
  track: Track;
  dayOfWeek: number | null;
  commentAuthor: string;
  onToggleFavorite: (id: string) => void;
  onToggleLike: (id: string) => void;
  onAddComment: (id: string, author: string, text: string) => void;
}

export function TrackCard({
  track,
  dayOfWeek,
  commentAuthor,
  onToggleFavorite,
  onToggleLike,
  onAddComment,
}: TrackCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const flag = countryFlagEmoji(track.countryCode);
  // Only ever the "very dangerous" ones — see the file doc comment for why.
  const dangerHazards = track.hazards.filter(
    (h) => h.severity === "high" && (dayOfWeek == null || h.dayOfWeek === dayOfWeek),
  );

  const poiCounts = track.pois.reduce<Partial<Record<Track["pois"][number]["type"], number>>>(
    (counts, poi) => {
      counts[poi.type] = (counts[poi.type] ?? 0) + 1;
      return counts;
    },
    {},
  );

  function submitComment(e: FormEvent) {
    e.preventDefault();
    onAddComment(track.id, commentAuthor, commentText);
    setCommentText("");
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.surfaceTag}>{SURFACE_LABEL[track.surfaceType]}</span>
          {track.days.length > 1 && (
            <span className={styles.daysTag}>
              <CalendarDays className={styles.tagIcon} aria-hidden="true" />
              {track.days.length} days
            </span>
          )}
        </div>
        <button
          type="button"
          className={track.favorite ? `${styles.favBtn} ${styles.favActive}` : styles.favBtn}
          onClick={() => onToggleFavorite(track.id)}
          aria-label={track.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            width={16}
            height={16}
            fill={track.favorite ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>
      </div>

      <h3 className={styles.name}>{track.name}</h3>
      <p className={styles.location}>
        {flag && <span aria-hidden="true">{flag}</span>}
        {track.area}
        {track.state ? `, ${track.state}` : ""}, {track.country}
      </p>

      <div className={styles.statsRow}>
        <span className={styles.stat}>
          <Ruler className={styles.statIcon} aria-hidden="true" />
          {track.distanceKm} km
        </span>
        <span className={styles.stat}>
          <Mountain className={styles.statIcon} aria-hidden="true" />
          {track.climbM} m
        </span>
        <span className={styles.stat}>
          <TrendingDown className={styles.statIcon} aria-hidden="true" />
          {track.descentM} m
        </span>
      </div>

      <div className={styles.badgeRow}>
        <span className={`${styles.aqiBadge} ${AQI_TONE[track.airQuality.label]}`}>
          <Wind className={styles.tagIcon} aria-hidden="true" />
          Air: {track.airQuality.label}
        </span>
      </div>

      {dangerHazards.length > 0 && (
        <div className={styles.dangerBox}>
          <div className={styles.dangerHeader}>
            <AlertTriangle className={styles.dangerIcon} aria-hidden="true" />
            {dangerHazards.length === 1
              ? dangerHazards[0].description
              : `${dangerHazards.length} rider-reported hazards on this track`}
          </div>
          <p className={styles.dangerNote}>
            Reported by riders, not verified — not an El Niño Move recommendation.
          </p>
        </div>
      )}

      {Object.keys(poiCounts).length > 0 && (
        <div className={styles.poiRow}>
          {(Object.entries(poiCounts) as [Track["pois"][number]["type"], number][]).map(
            ([type, count]) => {
              const Icon = POI_ICON[type];
              return (
                <span key={type} className={styles.poiItem} title={POI_LABEL[type]}>
                  <Icon className={styles.tagIcon} aria-hidden="true" />
                  {count}
                </span>
              );
            },
          )}
        </div>
      )}

      <div className={styles.socialRow}>
        <button
          type="button"
          className={track.liked ? `${styles.socialBtn} ${styles.socialActive}` : styles.socialBtn}
          onClick={() => onToggleLike(track.id)}
        >
          <ThumbsUp
            width={15}
            height={15}
            aria-hidden="true"
            fill={track.liked ? "currentColor" : "none"}
          />
          {track.likes}
        </button>
        <button
          type="button"
          className={styles.socialBtn}
          onClick={() => setCommentsOpen((v) => !v)}
        >
          <MessageCircle width={15} height={15} aria-hidden="true" />
          {track.comments.length}
        </button>
      </div>

      {commentsOpen && (
        <div className={styles.comments}>
          {track.comments.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              No comments yet.
            </p>
          ) : (
            track.comments.map((c) => (
              <div key={c.id} className={styles.comment}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{c.author}</span>
                  <span className="muted">{formatAge(c.createdAt)}</span>
                </div>
                <p className={styles.commentText}>{c.text}</p>
              </div>
            ))
          )}

          <form className={styles.commentForm} onSubmit={submitComment}>
            <input
              className={styles.commentInput}
              placeholder="Add a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button type="submit" className="button" disabled={!commentText.trim()}>
              Post
            </button>
          </form>
        </div>
      )}

      <Link className={styles.planBtn} to="/events/new">
        Plan a ride with this track
      </Link>
    </div>
  );
}
