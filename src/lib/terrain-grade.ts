// Terrain grade — how technical the GROUND is on an off-road ride, 1-5.
//
// WHY THIS IS NOT `level`
//   lib/rider-level.ts already answers "who is this ride pitched at" (Beginners .. World Tour,
//   or min/km for a run) and is labelled "Difficulty" on every card. That is a FITNESS answer.
//   It says nothing about what is under the tyre, and off-road the two are independent:
//   "Beginners pace over S3 singletrack" is a real ride, and a rider who turns up to it on
//   32mm tyres because the card said "Beginners" has been misled by a number that was true.
//
//   So this is a second, orthogonal axis. The card shows both: Level and Terrain.
//
// WHY THE NUMBER IS STORED AND THE WORDS LIVE HERE
//   events.terrain_grade is a plain SMALLINT 1-5 (server sql/038). The vocabulary is
//   per-discipline, and putting it in the client is the same choice rider-level.ts already made
//   when it relabelled the five levels as min/km for running: one column, and the words can
//   change without a migration.
//
//     mtb     S1-S5  Singletrail-Skala — the European standard already painted on trail signs
//     gravel  G1-G5  surface grades, smooth dirt road up to sand/mud/chunky rock
//
// WHY ONLY mtb AND gravel
//   On a road ride the surface is the road; a grade would be noise. Running and hiking have
//   their own established scales this app does not model. The server deliberately stores a
//   grade whoever sends it (see sql/038's header) — keeping the value through a discipline
//   switch instead of destroying it — so the gating is here, on collection and display.

import type { SurfaceType } from "./surface-types";

/** 1-5. Narrow so a stray 0 or 6 cannot be constructed without a cast. */
export type TerrainGrade = 1 | 2 | 3 | 4 | 5;

export const TERRAIN_GRADES: readonly TerrainGrade[] = [1, 2, 3, 4, 5];

/** The disciplines that collect and show a grade. */
const GRADED_SURFACES: readonly SurfaceType[] = ["mtb", "gravel"];

/**
 * Does this kind of ride have a terrain grade at all?
 *
 * `null` (discipline not stated) is false: with no discipline there is no scale to read the
 * number against, and "3" on its own means nothing to a rider.
 */
export function terrainApplies(activityType: SurfaceType | null | undefined): boolean {
  return activityType != null && GRADED_SURFACES.includes(activityType);
}

interface GradeCopy {
  /** The short badge — what a rider recognises from a trail sign. */
  label: string;
  /** What the ground actually is, in one line. Shown in the picker and on the ride page. */
  terrain: string;
}

/**
 * Singletrail-Skala, compressed to five. The real scale runs S0-S5; S0 ("forest road, no
 * obstacles") is folded into S1 here, because a ride with literally nothing technical about it
 * is a gravel ride and should be graded on that scale instead.
 */
const MTB_GRADES: Record<TerrainGrade, GradeCopy> = {
  1: { label: "S1", terrain: "Hardpack trail, small roots and stones" },
  2: { label: "S2", terrain: "Bigger roots and steps, loose surface" },
  3: { label: "S3", terrain: "Tight switchbacks, drops, rock sections" },
  4: { label: "S4", terrain: "Very steep and tight — expect to walk sections" },
  5: { label: "S5", terrain: "Extreme. Experts only" },
};

/**
 * Gravel surface grades. Keyed on the two things that actually decide whether a rider can come:
 * what the surface does to your line, and what tyre it needs.
 */
const GRAVEL_GRADES: Record<TerrainGrade, GradeCopy> = {
  1: { label: "G1", terrain: "Smooth dirt road — 32mm is fine" },
  2: { label: "G2", terrain: "Hardpack and gravel, some washboard" },
  3: { label: "G3", terrain: "Loose gravel and ruts — 40mm+" },
  4: { label: "G4", terrain: "Sand, mud and chunky rock" },
  5: { label: "G5", terrain: "Near-MTB: rough doubletrack, technical" },
};

function gradesFor(activityType: SurfaceType | null | undefined): Record<TerrainGrade, GradeCopy> {
  return activityType === "gravel" ? GRAVEL_GRADES : MTB_GRADES;
}

/** "S3" / "G3" — the badge for one grade on one kind of ride. */
export function terrainLabelFor(
  grade: TerrainGrade,
  activityType: SurfaceType | null | undefined,
): string {
  return gradesFor(activityType)[grade].label;
}

/** "Tight switchbacks, drops, rock sections" — the one-line description of the ground. */
export function terrainDescriptionFor(
  grade: TerrainGrade,
  activityType: SurfaceType | null | undefined,
): string {
  return gradesFor(activityType)[grade].terrain;
}

/** Every option, in order, for the create form's picker. */
export function terrainOptionsFor(
  activityType: SurfaceType | null | undefined,
): { grade: TerrainGrade; label: string; terrain: string }[] {
  const grades = gradesFor(activityType);
  return TERRAIN_GRADES.map((grade) => ({ grade, ...grades[grade] }));
}

/** What the scale is called, for a heading or a form label. */
export function terrainScaleNameFor(activityType: SurfaceType | null | undefined): string {
  return activityType === "gravel" ? "Surface grade" : "Singletrail scale";
}

/**
 * Narrow whatever the API sent to a grade this module can render.
 *
 * The server validates 1-5, but a cached row from an older client, or a future scale, could
 * carry anything — and a card must show a dash rather than crash on it. Returns null for
 * "not stated", which is what every ride is until an organizer chooses.
 */
export function asTerrainGrade(value: number | null | undefined): TerrainGrade | null {
  if (value == null || !Number.isInteger(value)) return null;
  return TERRAIN_GRADES.includes(value as TerrainGrade) ? (value as TerrainGrade) : null;
}
