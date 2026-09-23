// What a track hands to the create form when a rider starts a ride from it — the router state
// EventCreatePage reads as `pickedTrack`. One builder so Find Tracks' card link, TracksPage's
// callback and the shared-track page can never send different shapes.
//
// Every field is the track row's own value or null. Nothing is defaulted here: a field the track
// does not carry stays for the organizer to fill (an old track with no country shows the
// Country field; see EventCreatePage).

import type { EventSummary } from "./local-db";
import { regionLabel } from "./regions";
import type { SurfaceType } from "./surface-types";

export interface TrackHandoff {
  fromRouteId: number | null;
  fromRouteName: string | null;
  fromRoutePlace: string | null;
  fromRouteDistanceKm: number | null;
  fromRouteClimbM: number | null;
  fromRouteSurface: SurfaceType | null;
  /** The track's country (2-letter), or null for an old track that never had one. */
  fromRouteCountry: string | null;
  /** Coarse region key (src/lib/regions.ts), Israel only. */
  fromRouteRegion: string | null;
  fromRouteDurationMin: number | null;
  fromRouteTerrainGrade: number | null;
  fromRouteDifficulty: string | null;
  fromRouteSeason: string | null;
  fromRouteShade: string | null;
}

export function trackHandoffState(event: EventSummary): TrackHandoff {
  return {
    fromRouteId: event.routeId ?? null,
    fromRouteName: event.name,
    fromRoutePlace: regionLabel(event.region) || event.location || event.area || null,
    fromRouteDistanceKm: event.distanceKm ?? null,
    fromRouteClimbM: event.elevationGain ?? null,
    fromRouteSurface: event.activityType ?? null,
    fromRouteCountry: event.country ?? null,
    fromRouteRegion: event.region ?? null,
    fromRouteDurationMin: event.durationMin ?? null,
    fromRouteTerrainGrade: event.terrainGrade ?? null,
    fromRouteDifficulty: event.routeDifficulty ?? null,
    fromRouteSeason: event.season ?? null,
    fromRouteShade: event.shade ?? null,
  };
}
