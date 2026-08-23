// Level (Beginners/Intermediate/Masters/Elite/World Tour) — a rough "how hard is this ride /
// who's it pitched at" label, asked for directly ("so when rider pick ride he can see the
// hardness"). Client-only, same as Activity type — no server column exists yet, see
// plan/server-tasks.md Part C §1b. Shared between EventCreatePage.tsx (sets it),
// EventCard.tsx/EventTile.tsx (show it while browsing, before joining — the actual point of
// this), and EventDetailPage.tsx.

import { Award, Circle, Flame, TrendingUp, Trophy } from "lucide-react";
import type { SurfaceType } from "./surface-types";

export type RiderLevel = "beginner" | "intermediate" | "masters" | "elite" | "world_tour";

export const LEVELS: { value: RiderLevel; label: string; icon: typeof Circle }[] = [
  { value: "beginner", label: "Beginners", icon: Circle },
  { value: "intermediate", label: "Intermediate", icon: TrendingUp },
  { value: "masters", label: "Masters", icon: Award },
  { value: "elite", label: "Elite", icon: Flame },
  { value: "world_tour", label: "World Tour", icon: Trophy },
];

export const LEVEL_LABEL: Record<RiderLevel, string> = Object.fromEntries(
  LEVELS.map((l) => [l.value, l.label]),
) as Record<RiderLevel, string>;

export const LEVEL_ICON: Record<RiderLevel, typeof Circle> = Object.fromEntries(
  LEVELS.map((l) => [l.value, l.icon]),
) as Record<RiderLevel, typeof Circle>;

/**
 * For a RUNNING event, "difficulty" is pace — asked for directly: beginner is 7+ min/km, then
 * 6, 5, 4, and 3 min/km at the sharp end. Same five levels, same order, same bars; only the
 * label changes, because "Masters" tells a runner nothing while "5 min/km" tells them exactly
 * whether they can hold the group.
 *
 * Cycling/gravel/MTB keep the named levels — there is no equivalent single pace number for a
 * ride, where terrain and wind dominate.
 */
export const RUNNING_PACE_LABEL: Record<RiderLevel, string> = {
  beginner: "7+ min/km",
  intermediate: "6 min/km",
  masters: "5 min/km",
  elite: "4 min/km",
  world_tour: "3 min/km",
};

/** The label to show for one level on one kind of event. */
export function levelLabelFor(level: RiderLevel, activityType: SurfaceType | null): string {
  return activityType === "running" ? RUNNING_PACE_LABEL[level] : LEVEL_LABEL[level];
}

/** What the difficulty tile is called for this kind of event. */
export function levelHeadingFor(activityType: SurfaceType | null): string {
  return activityType === "running" ? "Pace" : "Difficulty";
}
