// Filter + sort model for the event-create "Browse tracks" picker (TrackGallerySheet).
//
// Unlike find-rides-filter.ts, this one is SERVER-BACKED: the gallery pages GET /events/public
// 24 rows at a time, so filtering in the client would only ever see the current page. The job
// here is to turn the rider's choices into the query string the server already understands
// (event.schemas.ts publicEventsQuerySchema), and — for the "My rides" toggle, which is one
// fully-loaded page — to apply the exact same criteria in memory so both sources agree.
//
// Every field on these criteria maps to data the server already stores and serialises
// (toEventSummary): area, activity_type, level, duration_min, and the attached route's
// distance / effective climb. Nothing here needs a new column.

import type { EventSummary } from "./local-db";
import { type DurationBucketKey, matchesDurationBuckets } from "./ride-duration";
import type { RiderLevel } from "./rider-level";
import type { SurfaceType } from "./surface-types";
import { CLIMB_MAX, CLIMB_MIN, DISTANCE_MAX, DISTANCE_MIN } from "./track-types";

export type TrackGallerySort =
  | "newest"
  | "oldest"
  | "distance_asc"
  | "distance_desc"
  | "elevation_asc"
  | "elevation_desc"
  | "duration_asc"
  | "duration_desc"
  | "name_asc";

export const TRACK_SORT_LABEL: Record<TrackGallerySort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  distance_asc: "Distance: low → high",
  distance_desc: "Distance: high → low",
  elevation_asc: "Climb: low → high",
  elevation_desc: "Climb: high → low",
  duration_asc: "Duration: short → long",
  duration_desc: "Duration: long → short",
  name_asc: "Name (A–Z)",
};

/** created_at DESC — the stable key the gallery has always paged against. */
export const DEFAULT_TRACK_GALLERY_SORT: TrackGallerySort = "newest";

export interface TrackGalleryCriteria {
  /** Exact-match against events.area — values come from GET /events/public/areas. */
  areas: string[];
  /** events.activity_type — the ride's discipline (road / gravel / mtb / running / hiking). */
  surface: SurfaceType[];
  level: RiderLevel[];
  /** Attached route distance, km. At [DISTANCE_MIN, DISTANCE_MAX] = "any". */
  distanceKm: [number, number];
  /** Effective climb, m. At [CLIMB_MIN, CLIMB_MAX] = "any". */
  climbM: [number, number];
  durationBuckets: DurationBucketKey[];
}

export const DEFAULT_TRACK_GALLERY_CRITERIA: TrackGalleryCriteria = {
  areas: [],
  surface: [],
  level: [],
  distanceKm: [DISTANCE_MIN, DISTANCE_MAX],
  climbM: [CLIMB_MIN, CLIMB_MAX],
  durationBuckets: [],
};

const distanceNarrowed = (r: [number, number]) => r[0] > DISTANCE_MIN || r[1] < DISTANCE_MAX;
const climbNarrowed = (r: [number, number]) => r[0] > CLIMB_MIN || r[1] < CLIMB_MAX;

/** How many filter GROUPS are narrowing the list — the badge on the Filter button. A range
 *  counts as one no matter how many handles moved. */
export function trackGalleryActiveFilterCount(c: TrackGalleryCriteria): number {
  return (
    c.areas.length +
    c.surface.length +
    c.level.length +
    c.durationBuckets.length +
    (distanceNarrowed(c.distanceKm) ? 1 : 0) +
    (climbNarrowed(c.climbM) ? 1 : 0)
  );
}

/**
 * The query string for one page of GET /events/public. `limit` / `offset` / paging are the
 * hook's job; this adds `q`, `sort` and every active filter, and OMITS anything at its default
 * (an untouched range, an empty multi-select) so the URL only carries real narrowing —
 * the same rule TracksPage uses for its sliders.
 */
export function buildTrackGalleryQuery(
  criteria: TrackGalleryCriteria,
  sort: TrackGallerySort,
  search: string,
): URLSearchParams {
  const params = new URLSearchParams();

  const q = search.trim();
  if (q) params.set("q", q);

  // sort=newest is sent explicitly: it is the gallery's paging key, not merely the server
  // default (which flips with the bucket, and the gallery sends no bucket).
  params.set("sort", sort);

  if (criteria.areas.length > 0) params.set("areas", criteria.areas.join(","));
  if (criteria.surface.length > 0) params.set("activityType", criteria.surface.join(","));
  if (criteria.level.length > 0) params.set("level", criteria.level.join(","));
  if (criteria.durationBuckets.length > 0) {
    params.set("durationBuckets", criteria.durationBuckets.join(","));
  }

  const [dMin, dMax] = criteria.distanceKm;
  if (dMin > DISTANCE_MIN) params.set("minDistanceKm", String(dMin));
  if (dMax < DISTANCE_MAX) params.set("maxDistanceKm", String(dMax));

  const [cMin, cMax] = criteria.climbM;
  if (cMin > CLIMB_MIN) params.set("minClimbM", String(cMin));
  if (cMax < CLIMB_MAX) params.set("maxClimbM", String(cMax));

  return params;
}

function compareForSort(a: EventSummary, b: EventSummary, sort: TrackGallerySort): number {
  // Missing metric always sinks to the bottom, regardless of direction — matches the server's
  // NULLS LAST.
  const byNum = (pick: (e: EventSummary) => number | null | undefined, dir: 1 | -1): number => {
    const va = pick(a);
    const vb = pick(b);
    const na = va == null || !Number.isFinite(va);
    const nb = vb == null || !Number.isFinite(vb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return dir * ((va as number) - (vb as number));
  };
  // The event summary carries no created_at, so the in-memory ("My rides") ordering uses the
  // start time as its recency proxy. The server path never comes through here — it orders by
  // the real created_at.
  const recency = (e: EventSummary) => (e.startsAt ? Date.parse(e.startsAt) : null);

  switch (sort) {
    case "newest":
      return byNum(recency, -1);
    case "oldest":
      return byNum(recency, 1);
    case "distance_asc":
      return byNum((e) => e.distanceKm, 1) || byNum(recency, -1);
    case "distance_desc":
      return byNum((e) => e.distanceKm, -1) || byNum(recency, -1);
    case "elevation_asc":
      return byNum((e) => e.elevationGain, 1) || byNum(recency, -1);
    case "elevation_desc":
      return byNum((e) => e.elevationGain, -1) || byNum(recency, -1);
    case "duration_asc":
      return byNum((e) => e.durationMin, 1) || byNum(recency, -1);
    case "duration_desc":
      return byNum((e) => e.durationMin, -1) || byNum(recency, -1);
    case "name_asc":
      return a.name.localeCompare(b.name);
    default:
      return 0;
  }
}

/**
 * Apply the criteria + sort in memory. Used ONLY for the "My rides" toggle (already one full
 * page); the "All rides" list is filtered and sorted by the server. `search` matches name,
 * location, area and ride code, case-insensitive — the same fields the server's `q` covers.
 */
export function applyTrackGalleryCriteria(
  rows: EventSummary[],
  c: TrackGalleryCriteria,
  sort: TrackGallerySort,
  search: string,
): EventSummary[] {
  const q = search.trim().toLowerCase();
  const [dMin, dMax] = c.distanceKm;
  const [cMin, cMax] = c.climbM;
  const dNarrow = distanceNarrowed(c.distanceKm);
  const cNarrow = climbNarrowed(c.climbM);

  const filtered = rows.filter((e) => {
    if (
      q &&
      !e.name.toLowerCase().includes(q) &&
      !(e.location ?? "").toLowerCase().includes(q) &&
      !(e.area ?? "").toLowerCase().includes(q) &&
      !e.code.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (c.areas.length > 0 && !(e.area != null && c.areas.includes(e.area.trim()))) return false;
    if (c.surface.length > 0 && !(e.activityType != null && c.surface.includes(e.activityType))) {
      return false;
    }
    if (c.level.length > 0 && !(e.level != null && c.level.includes(e.level))) return false;

    if (dNarrow) {
      const dist = e.distanceKm;
      if (dist == null || dist < dMin || dist > dMax) return false;
    }
    if (cNarrow) {
      const climb = e.elevationGain ?? e.climbM ?? null;
      if (climb == null || climb < cMin || climb > cMax) return false;
    }
    if (!matchesDurationBuckets(e.durationMin, c.durationBuckets)) return false;
    return true;
  });

  return [...filtered].sort((a, b) => compareForSort(a, b, sort));
}
