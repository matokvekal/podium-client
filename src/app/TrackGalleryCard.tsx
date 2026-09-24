/**
 * One track in the gallery, presented the way a trip is presented in a catalogue: a real map
 * of where it goes, the name big enough to read at a glance, the area, then the numbers that
 * decide whether a rider wants it.
 *
 * THE MAP IS A REAL MAP. Earlier this card drew only an SVG line on a coloured ground, which
 * showed the shape of a route but not where on earth it was — you could not tell a coast road
 * from a forest track, or recognise your own town. It is now a live OpenStreetMap map you can
 * pan and zoom (TrackMiniMap), windowed so only the cards on screen hold one; see that file
 * for how that stays affordable in a list of thousands.
 *
 * WHERE THE LINE COMES FROM: the row itself. `event.preview` is a 60-point line plus a
 * whole-metre elevation series, embedded in every row of the paginated list (GET /events/public,
 * GET /events), so drawing a card costs no request at all — scrolling through fifty pages is
 * fifty requests, not fifty pages' worth of one-per-card geometry calls, which is what used to
 * exhaust the API's rate limit. The DETAILED line (a few hundred points) is fetched only when the
 * rider explores this card's map — a tap on "Tap to explore" or a press on the map — and swapped
 * in place (track-detail.ts). The original GPX is neither of these and is never loaded here.
 *
 * The SVG line is the INSTANT UNDERLAY beneath the map: it paints from the preview before a
 * single tile has been requested, so the card shows the real route immediately instead of a grey
 * hole, and a rider whose tiles never arrive still sees it.
 *
 * WHAT THE NUMBERS ARE, AND WHY EACH IS REAL:
 *
 *   distance / climb  the list row's own figures: the route's distance and the EFFECTIVE climb
 *                     (the organizer's value, else the route's — the server resolves it).
 *   ride time         events.duration_min — the organizer's own estimate. NOT derived from
 *                     distance: lib/ride-duration.ts is explicit that inventing one needs an
 *                     assumed speed, which this app does not ship. Shown as "Not stated"
 *                     rather than omitted, so the rows stay aligned down the grid.
 *   downloads         how many rides have been built on this track (server: route_copies, on
 *                     GET /events/public only; other lists show a dash). A
 *                     real reuse count, not a view counter. Reads "soon" until the server
 *                     sends it — never the rider count wearing a downloads label, which would
 *                     be a confident wrong answer to a different question.
 *   created by        the organizer the track comes from. Also "soon": the public list serves
 *                     ownerId but no ownerName, so the name is missing from the payload rather
 *                     than from the world.
 *
 * The rider count that used to sit here is gone, replaced by downloads — asked for directly.
 */

import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  Clock,
  CloudSun,
  Gauge,
  Heart,
  MapPin,
  Mountain,
  MoveRight,
  Repeat,
  Route as RouteIcon,
  Share2,
  Sun,
  ThumbsUp,
  Trees,
  User,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { EventRoute } from "../lib/event-route";
import { haversineDistanceKm } from "../lib/geo";
import type { EventSummary } from "../lib/local-db";
import { regionLabel } from "../lib/regions";
import { formatDuration } from "../lib/ride-duration";
import { levelLabelFor } from "../lib/rider-level";
import {
  asTerrainGrade,
  terrainApplies,
  terrainDescriptionFor,
  terrainLabelFor,
} from "../lib/terrain-grade";
import {
  asRouteDifficulty,
  asTrailSeason,
  asTrailShade,
  ROUTE_DIFFICULTY_LABEL,
  TRAIL_SEASON_LABEL,
  TRAIL_SEASON_SHORT,
  TRAIL_SHADE_LABEL,
  TRAIL_SHADE_SHORT,
  type TrailShade,
  trailMetadataApplies,
} from "../lib/trail-metadata";
import { trackHandoffState } from "../lib/track-handoff";
import { trackSharePath } from "../lib/track-share-url";
import { resolveTrackLikes, useTrackLikesStore } from "../store/trackLikesStore";
import { useIsOrganizer } from "../store/userModeStore";
import { type DistanceIcon, distanceIconFor } from "./ActivityIcons";
import { ElevationProfile } from "./ElevationProfile";
import { placeholderCoverGradient } from "./event-visuals";
import styles from "./TrackGalleryCard.module.css";
import { cachedTrackDetail, loadTrackDetail } from "./track-detail";
import { projectTrack } from "./track-thumbnail";

// Leaflet must never reach the main bundle — it takes it from 65 kB to 559 kB. Every consumer
// stays lazy, this one included.
const TrackMiniMap = lazy(() => import("./TrackMiniMap"));

/**
 * One number on the card. The icon carries the meaning and the caption is visually hidden, so
 * four facts fit on one line without losing anything for a screen reader.
 *
 * A missing value renders as an em dash rather than "Not stated" — at this size the words cost
 * a whole extra line, and a dash is the same honest answer: we do not know, and we are not
 * going to guess one.
 */
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: DistanceIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>
        <Icon className={styles.statIcon} aria-hidden="true" />
        <span className={styles.statLabelText}>{label}</span>
      </dt>
      <dd className={value ? styles.statValue : styles.statValueMuted}>{value ?? "—"}</dd>
    </div>
  );
}

const SHADE_ICON: Record<TrailShade, DistanceIcon> = {
  shaded: Trees,
  partial: CloudSun,
  exposed: Sun,
};

/** The underlay's coordinate space. Rendered via viewBox, so these are ratios as much as px. */
const THUMB_W = 320;
const THUMB_H = 150;
const THUMB_PAD = 12;

/** How far outside the viewport a card still keeps its live map. One screen of margin means
 * the map is ready before the card is looked at, without holding maps for the whole list. */
const MAP_ROOT_MARGIN = "250px";

/** What a real field reads as until the API can answer it. Same word EventCard uses, so the
 * two surfaces say "not built yet" identically rather than inventing a second vocabulary. */
const NOT_YET = "soon";

/** Start and finish within this of each other and the track is a loop. Generous on purpose: a
 *  ride that starts at the car park and ends at the café across the road is still a loop to
 *  the rider deciding whether they need a lift home. */
const LOOP_TOLERANCE_KM = 0.4;

interface TrackGalleryCardProps {
  event: EventSummary;
  /**
   * Whether the detailed line may be fetched without a token — true for the public list, whose
   * rides' routes are served anonymously. False for My Rides, which can hold a PRIVATE ride only
   * its owner may read.
   */
  anonymousDetail: boolean;
  /**
   * How this card hands its track over.
   *
   *   "modal" — inside the create form's picker: call onPick and let that form fill itself in.
   *   "page"  — standalone Find Tracks: there is no form to fill, so the button is a link to
   *             /events/new carrying the route id, the same handoff TrackCard has always used.
   */
  variant?: "modal" | "page";
  onPick: (event: EventSummary) => void;
}

export const TrackGalleryCard = memo(function TrackGalleryCard({
  event,
  anonymousDetail,
  onPick,
  variant = "modal",
}: TrackGalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  /** Whether this card currently holds a live Leaflet map. Drives the windowing. */
  const [mapLive, setMapLive] = useState(false);

  // Only the map window depends on visibility now. The line itself is already on the row, so
  // there is nothing to fetch as a card nears the screen — this observer mounts and unmounts the
  // Leaflet map and does nothing else.
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setMapLive(entries[0]?.isIntersecting ?? false),
      { rootMargin: MAP_ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The card is drawn from the row's 60-point preview...
  const preview = event.preview ?? null;
  // ...and from the detailed line once the rider has explored the map (or did earlier: the cache
  // outlives the card, so scrolling away and back does not lose it or refetch it).
  const [detail, setDetail] = useState<EventRoute | undefined>(() => cachedTrackDetail(event.id));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const eventId = event.id;
  const handleExplore = useCallback(() => {
    void loadTrackDetail(eventId, { anonymous: anonymousDetail }).then((route) => {
      if (route && mounted.current) setDetail(route);
    });
  }, [eventId, anonymousDetail]);

  const previewPoints = preview?.points ?? null;
  const mapPoints = detail?.points ?? previewPoints;

  const projected = useMemo(
    () => (previewPoints ? projectTrack(previewPoints, THUMB_W, THUMB_H, THUMB_PAD) : null),
    [previewPoints],
  );

  const isOrganizer = useIsOrganizer();
  const routeId = event.routeId ?? null;
  // Subscribe to THIS track's override only, so one rider liking one card does not re-render
  // every other card in the grid.
  const override = useTrackLikesStore((s) => (routeId == null ? undefined : s.overrides[routeId]));
  const busy = useTrackLikesStore((s) => (routeId == null ? false : s.pending.includes(routeId)));
  const likeTrack = useTrackLikesStore((s) => s.like);
  const toggleFavorite = useTrackLikesStore((s) => s.toggleFavorite);
  const { likes, likedByMe, favoritedByMe } = resolveTrackLikes(override, event);

  const distanceKm = event.distanceKm;
  const climbM = event.elevationGain;
  const duration = formatDuration(event.durationMin);
  const place = regionLabel(event.region) || event.location || event.area;
  // Only GET /events/public carries the reuse count; elsewhere the card shows a dash.
  const downloads = event.downloads;

  // Difficulty is a property of the RIDE, not the track — which is why the gallery has never
  // filtered on it. Shown here anyway, and ONLY for mountain biking, because off-road is the
  // one discipline where the grade changes whether a rider can ride the line at all. Its label
  // is discipline-aware (lib/rider-level.ts), so it reads in MTB terms rather than road ones.
  const difficulty =
    event.activityType === "mtb" && event.level
      ? levelLabelFor(event.level, event.activityType)
      : null;

  /**
   * The terrain grade (sql/038) — S1-S5 on MTB, G1-G5 on gravel.
   *
   * Shown here as well as on the ride card, and arguably it belongs here MORE: someone browsing
   * Find Tracks is choosing a line to ride, and "G4 — sand, mud and chunky rock" is the fact
   * that decides whether their bike can do it. Unlike `difficulty` above this is not limited to
   * MTB, because gravel has its own scale.
   */
  const terrain = terrainApplies(event.activityType) ? asTerrainGrade(event.terrainGrade) : null;

  /**
   * THE TRAIL FACTS (sql/041) — how hard the track is, how much shade, when it is good to ride.
   * Off-road only (mtb / gravel), and only the ones the ride actually states: a missing field is
   * simply not drawn, never guessed. There is no water field anywhere in the data, so there is
   * no water badge.
   *
   * Drawn as badges in the map's top-right corner (the zoom control owns top-left) rather than as
   * another row under it, so an MTB card is exactly as tall as any other.
   */
  const trailFacts = trailMetadataApplies(event.activityType)
    ? {
        difficulty: asRouteDifficulty(event.routeDifficulty),
        shade: asTrailShade(event.shade),
        season: asTrailSeason(event.season),
      }
    : null;
  const hasTrailFacts =
    trailFacts != null && (trailFacts.difficulty || trailFacts.shade || trailFacts.season);

  // LOOP OR POINT-TO-POINT, derived from the geometry the card already has. This is the honest
  // answer to "where does it start and end": the map below already marks both ends, and the
  // one thing a rider cannot see at card size is whether they finish back at the car. Naming
  // the two places would need reverse geocoding the app does not have — printing coordinates
  // would be noise.
  const shape = useMemo(() => {
    const points = previewPoints;
    if (!points || points.length < 2) return null;
    const start = points[0];
    const end = points[points.length - 1];
    if (!start || !end) return null;
    return haversineDistanceKm(start, end) <= LOOP_TOLERANCE_KM ? "loop" : "point-to-point";
  }, [previewPoints]);

  // SHARE THIS ONE TRACK — /mtb/<routes.id> (lib/track-share-url.ts). The device's own share
  // sheet when it has one (every phone), else the link is copied. Works signed out: the track
  // page it opens is public.
  const [shareCopied, setShareCopied] = useState(false);
  async function handleShare() {
    if (routeId == null) return;
    const url = `${window.location.origin}${trackSharePath(event.activityType, routeId)}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: event.name, url });
      } catch {
        // Dismissed — not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  function handleLike() {
    if (routeId == null || likedByMe || busy) return;
    void likeTrack(routeId, likes);
  }

  function handleFavorite() {
    if (routeId == null || busy) return;
    void toggleFavorite(routeId, favoritedByMe);
  }

  return (
    <div className={styles.card} ref={cardRef}>
      <div className={styles.media}>
        {/* The instant underlay. Always painted, always beneath — the map fades in over it. */}
        <div
          className={styles.underlay}
          style={{ background: placeholderCoverGradient(event.id) }}
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
        </div>

        {mapLive && mapPoints && mapPoints.length > 1 && (
          <div className={styles.mapLayer}>
            <Suspense fallback={null}>
              <TrackMiniMap points={mapPoints} label={event.name} onExplore={handleExplore} />
            </Suspense>
          </div>
        )}

        {hasTrailFacts && trailFacts && (
          <ul className={styles.trailFacts} aria-label="Trail">
            {trailFacts.difficulty && (
              <li
                className={`${styles.trailFact} ${styles.trailFactDifficulty}`}
                title={`קושי המסלול: ${ROUTE_DIFFICULTY_LABEL[trailFacts.difficulty]}`}
              >
                <Gauge className={styles.trailFactIcon} aria-hidden="true" />
                {ROUTE_DIFFICULTY_LABEL[trailFacts.difficulty]}
              </li>
            )}
            {trailFacts.shade &&
              (() => {
                const ShadeIcon = SHADE_ICON[trailFacts.shade];
                return (
                  <li className={styles.trailFact} title={TRAIL_SHADE_LABEL[trailFacts.shade]}>
                    <ShadeIcon className={styles.trailFactIcon} aria-hidden="true" />
                    <span aria-hidden="true">{TRAIL_SHADE_SHORT[trailFacts.shade]}</span>
                    <span className={styles.statLabelText}>
                      {TRAIL_SHADE_LABEL[trailFacts.shade]}
                    </span>
                  </li>
                );
              })()}
            {trailFacts.season && (
              <li className={styles.trailFact} title={TRAIL_SEASON_LABEL[trailFacts.season]}>
                <CalendarDays className={styles.trailFactIcon} aria-hidden="true" />
                <span aria-hidden="true">{TRAIL_SEASON_SHORT[trailFacts.season]}</span>
                <span className={styles.statLabelText}>
                  {TRAIL_SEASON_LABEL[trailFacts.season]}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* The climb profile, directly under the map — the same component and the same reading
          the ride page shows, so a track looks the same wherever a rider meets it. Short here
          because it is a shape, not a chart to read values off: it answers "is this lumpy or
          flat" at a glance, and the metre figure is in the stats below.

          Renders nothing at all when the route carries no elevation series (every track saved
          before the server kept one, and any GPX with no <ele> tags) — an empty axis would
          imply a flat ride, which is a different claim from "unknown". */}
      {preview && preview.points.length > 1 && preview.elevations && (
        <div className={styles.profile}>
          <ElevationProfile
            points={preview.points}
            elevations={preview.elevations}
            heightPx={44}
          />
        </div>
      )}

      <div className={styles.body}>
        {/* Name and heart on one line, the same pairing EventCard uses — a rider who has learnt
            where the heart lives on a ride card finds it in the same place on a track card.
            The heart is the SAVE gesture: private, reversible, no number. */}
        <div className={styles.titleRow}>
          <h3 className={styles.name}>{event.name}</h3>
          {/* The right-hand corner: save on top, reuse count directly under it. Downloads sits
              here rather than in the numbers row because it is not a property of the RIDE like
              distance and climb — it is how popular the track is, which belongs next to the
              other social control. */}
          <div className={styles.corner}>
            {routeId != null && (
              <button
                type="button"
                className={styles.heartBtn}
                data-on={favoritedByMe}
                onClick={handleFavorite}
                disabled={busy}
                aria-pressed={favoritedByMe}
                aria-label={
                  favoritedByMe ? `Remove ${event.name} from saved` : `Save ${event.name}`
                }
              >
                <Heart
                  className={styles.heartIcon}
                  fill={favoritedByMe ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
            )}
            <span
              className={styles.downloads}
              title={`${downloads ?? 0} rides built on this track`}
            >
              <ArrowDownToLine className={styles.downloadsIcon} aria-hidden="true" />
              {downloads ?? "—"}
            </span>
          </div>
        </div>

        {/* Place, shape and difficulty share ONE line. They are all qualifiers on the same
            question — where is this and what kind of riding — and giving each its own row was
            most of the card's wasted height. Any of the three may be missing. */}
        {(place || shape || difficulty || terrain) && (
          <p className={styles.place}>
            {place && (
              <>
                <MapPin className={styles.placeIcon} aria-hidden="true" />
                <span className={styles.placeName}>{place}</span>
              </>
            )}
            {shape && (
              <span className={styles.chip}>
                {shape === "loop" ? (
                  <Repeat className={styles.chipIcon} aria-hidden="true" />
                ) : (
                  <MoveRight className={styles.chipIcon} aria-hidden="true" />
                )}
                {shape === "loop" ? "Loop" : "A→B"}
              </span>
            )}
            {difficulty && (
              <span className={`${styles.chip} ${styles.chipLevel}`}>{difficulty}</span>
            )}
            {terrain && (
              <span
                className={`${styles.chip} ${styles.chipTerrain}`}
                title={terrainDescriptionFor(terrain, event.activityType)}
              >
                {terrainLabelFor(terrain, event.activityType)}
              </span>
            )}
          </p>
        )}

        {/* THE NUMBERS, on one line.
            Was a 2x2 grid with an uppercase caption over every value — eight rows of text for
            four facts. The icon now IS the label: a ruler, a clock, a mountain, a download
            arrow are unambiguous at this size and need no caption. The value keeps its original
            size and weight, so the card reads exactly as loud while taking half the room. The
            captions stay in the DOM, visually hidden, so a screen reader still hears them. */}
        <dl className={styles.stats}>
          {/* The distance carries the BIKE it was ridden on, not a ruler — the same icon the
              ride card and ride page use (ActivityIcons), so a rider scanning the grid sees
              whether these are road kilometres or trail kilometres without reading a chip.
              Falls back to the ruler for running/hiking and a ride with no type set. */}
          <Stat
            icon={distanceIconFor(event.activityType)}
            label="Distance"
            value={distanceKm != null ? `${distanceKm} km` : null}
          />
          <Stat icon={Clock} label="Ride time" value={duration || null} />
          <Stat icon={Mountain} label="Climb" value={climbM != null ? `${climbM} m` : null} />
        </dl>

        {/* THE ACTION ROW. Like sits beside the main button rather than on the map, so the
            picture stays a picture and the card gains one row instead of two.

            A like is once and permanent (sql/036) — after it lands the button stays filled and
            stops responding, which is why it renders as pressed-and-done rather than as a
            toggle that quietly refuses. The count reads "—" only when the server did not send
            one; it is never shown as 0 on a guess. */}
        {/* ONE ROW: who it came from, the like, and the action. The owner used to have a line
            of its own captioned "Created by" — it is provenance, not a stat, so it now rides
            quietly at the left of the action row and truncates rather than wrapping. */}
        <div className={styles.actions}>
          <p className={styles.owner} title={event.ownerName?.trim() || undefined}>
            <User className={styles.ownerIcon} aria-hidden="true" />
            <span className={event.ownerName?.trim() ? styles.ownerName : styles.ownerPending}>
              {event.ownerName?.trim() || NOT_YET}
            </span>
          </p>

          {routeId != null && (
            <button
              type="button"
              className={styles.likeBtn}
              data-on={likedByMe}
              onClick={handleLike}
              disabled={likedByMe || busy}
              aria-pressed={likedByMe}
              aria-label={likedByMe ? `You liked ${event.name}` : `Like ${event.name}`}
            >
              <ThumbsUp
                className={styles.likeIcon}
                fill={likedByMe ? "currentColor" : "none"}
                aria-hidden="true"
              />
              <span className={styles.likeCount}>{likes ?? "—"}</span>
            </button>
          )}

          {routeId != null && (
            <button
              type="button"
              className={styles.likeBtn}
              data-on={shareCopied}
              onClick={handleShare}
              aria-label={shareCopied ? "Link copied" : `Share ${event.name}`}
              title={shareCopied ? "Link copied" : "Share"}
            >
              {shareCopied ? (
                <Check className={styles.likeIcon} aria-hidden="true" />
              ) : (
                <Share2 className={styles.likeIcon} aria-hidden="true" />
              )}
            </button>
          )}

          {variant === "page" ? (
            // Organizer-only, exactly as TrackCard's "Plan a ride" is: a rider in Rider mode
            // browses and saves tracks, but creating a ride is not something they can do, and
            // a button that leads to a redirect is worse than no button.
            isOrganizer && (
              <Link
                className={styles.useBtn}
                to="/events/new"
                state={trackHandoffState(event)}
              >
                <RouteIcon width={15} height={15} aria-hidden="true" />
                Ride it
              </Link>
            )
          ) : (
            <button type="button" className={styles.useBtn} onClick={() => onPick(event)}>
              <RouteIcon width={16} height={16} aria-hidden="true" />
              Use this track
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
