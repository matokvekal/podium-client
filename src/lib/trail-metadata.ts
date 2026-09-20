// Route difficulty, season and shade — three descriptive fields for off-road (MTB / gravel) tracks.
//
// The server stores STABLE ENGLISH KEYS (events.route_difficulty / season / shade, sql/041); the
// Hebrew words live here, exactly as terrain-grade.ts keeps the S1-S5 words and rider-level.ts the
// level words. A value can be relabelled or translated without touching the database.
//
// route difficulty is NOT `level` ("who is this ride pitched at") and NOT terrain grade ("what is
// under the tyre"): it is how hard the TRACK is. The three are shown side by side and never merged.
//
// Only mtb and gravel collect and show these. On a road ride they are simply absent — no empty
// fields — the same gating terrain-grade.ts uses.

import type { SurfaceType } from "./surface-types";

export const ROUTE_DIFFICULTIES = ["easy", "moderate", "hard", "challenging"] as const;
export type RouteDifficulty = (typeof ROUTE_DIFFICULTIES)[number];

export const TRAIL_SEASONS = [
  "all_year",
  "all_year_summer_ok",
  "winter_spring",
  "spring_autumn",
] as const;
export type TrailSeason = (typeof TRAIL_SEASONS)[number];

export const TRAIL_SHADES = ["shaded", "partial", "exposed"] as const;
export type TrailShade = (typeof TRAIL_SHADES)[number];

export const ROUTE_DIFFICULTY_LABEL: Record<RouteDifficulty, string> = {
  easy: "קל",
  moderate: "בינוני",
  hard: "קשה",
  challenging: "אתגרי",
};

export const TRAIL_SEASON_LABEL: Record<TrailSeason, string> = {
  all_year: "כל השנה",
  all_year_summer_ok: "כל השנה (נעים בקיץ)",
  winter_spring: "חורף–אביב",
  // Spring THROUGH autumn — the warm half of the year. Not autumn-to-spring.
  spring_autumn: "אביב–סתיו",
};

export const TRAIL_SHADE_LABEL: Record<TrailShade, string> = {
  shaded: "מוצל",
  partial: "חלקית מוצל",
  exposed: "חשוף לשמש",
};

const GATED_SURFACES: readonly SurfaceType[] = ["mtb", "gravel"];

/** Does this kind of ride collect / show route difficulty, season and shade? */
export function trailMetadataApplies(activityType: SurfaceType | null | undefined): boolean {
  return activityType != null && GATED_SURFACES.includes(activityType);
}

const asKey = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;

/** A server value narrowed to the vocabulary, or null — an unknown future value shows as nothing
 *  rather than as a raw key. */
export const asRouteDifficulty = (v: unknown) => asKey(ROUTE_DIFFICULTIES, v);
export const asTrailSeason = (v: unknown) => asKey(TRAIL_SEASONS, v);
export const asTrailShade = (v: unknown) => asKey(TRAIL_SHADES, v);
