// What kind of riding a track or event is — the taxonomy, not data.
//
// This used to live in lib/mock-tracks.ts alongside a hand-written library of fake tracks.
// It is real product vocabulary and always was: EventCreatePage's activity-type chips,
// EventCard/EventTile's surface badge and EventDetailPage's header icon all render from it,
// and the server stores the same five values in events.activity_type (sql/010-event-profile.sql).
// Deleting the mock data should not have deleted the vocabulary with it, so it moved here.
//
// Keep in sync with the server's ACTIVITY_TYPES (podium-server/src/db/types.ts).

import { Bike, Footprints, Mountain, PersonStanding, Route } from "lucide-react";

export type SurfaceType = "road" | "gravel" | "mtb" | "running" | "hiking";

/** Shared by TracksPage's surface filter pills, EventCreatePage's activity-type chips and the
 * event cards, so an event's icon is the same everywhere a rider sees it. */
export const SURFACE_TYPE_ICON: Record<SurfaceType, typeof Bike> = {
  road: Bike,
  gravel: Route,
  mtb: Mountain,
  running: Footprints,
  hiking: PersonStanding,
};

export const SURFACE_TYPE_LABEL: Record<SurfaceType, string> = {
  road: "Road",
  gravel: "Gravel",
  mtb: "MTB",
  running: "Running",
  hiking: "Hiking",
};
