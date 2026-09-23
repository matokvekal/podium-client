// Creating a ride FROM a known track (Find Tracks' "Ride it", the create form's own picker, or a
// shared track link) — what the form takes from the track, and which fields it then stops
// asking about.
//
// The rule, asked for directly: a known track already says what TERRAIN it is and what COUNTRY
// it is in, so the form takes both from the track and does not show those two fields at all.
// Everything ride-specific (date, time, description, level, ...) stays editable.
//
// Only a field the track actually carries is locked. An OLD track that predates events.country
// (sql/030) has none, so the Country field stays on screen for the organizer to answer — never
// guessed. Removing the track clears the source, which brings both fields back along with the
// upload / browse buttons.

import { isKnownCountryCode } from "./countries";
import type { SurfaceType } from "./surface-types";

/** What the create form keeps about the track it is being built from. */
export interface TrackSource {
  name: string | null;
  country: string | null;
  activityType: SurfaceType | null;
}

export interface TrackFieldLocks {
  /** Terrain comes from the track — hide the Terrain picker. */
  hideTerrain: boolean;
  /** Country comes from the track — hide the Country picker. */
  hideCountry: boolean;
}

export function trackFieldLocks(source: TrackSource | null): TrackFieldLocks {
  return {
    hideTerrain: source?.activityType != null,
    hideCountry: source != null && isKnownCountryCode(source.country),
  };
}

/** A country code from the track only if it is one the app knows; anything else is "missing". */
export function trackCountry(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return isKnownCountryCode(code) ? code : null;
}
