// Level (Beginners/Intermediate/Masters/Elite/World Tour) — a rough "how hard is this ride /
// who's it pitched at" label, asked for directly ("so when rider pick ride he can see the
// hardness"). Client-only, same as Activity type — no server column exists yet, see
// plan/server-tasks.md Part C §1b. Shared between EventCreatePage.tsx (sets it),
// EventCard.tsx/EventTile.tsx (show it while browsing, before joining — the actual point of
// this), and EventDetailPage.tsx.

import { Award, Circle, Flame, TrendingUp, Trophy } from "lucide-react";

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
