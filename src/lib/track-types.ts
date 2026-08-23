// The shape of a track in the "Find Tracks" planner.
//
// These are TYPES ONLY — there is deliberately no data behind them. They previously lived in
// lib/mock-tracks.ts next to a hand-written array of invented tracks; that array is gone, and
// with it every fake rider, route and comment the planner used to display.
//
// They are kept rather than deleted because they describe the contract the real endpoint has
// to satisfy: GET /tracks (podium-server, not built yet — see plan/server-tasks.md). When it
// lands, tracksStore.ts swaps its empty result for a fetch and nothing else has to change.
//
// Until then TracksPage renders its empty state. That is the honest thing for it to show:
// there are no tracks yet, and inventing some made the app look finished when it was not.

import type { SurfaceType } from "./surface-types";

export type AirQualityLabel = "Good" | "Moderate" | "Unhealthy";
export type HazardSeverity = "low" | "medium" | "high";

export interface TrackHazard {
  dayOfWeek: number;
  severity: HazardSeverity;
  description: string;
  point: [number, number];
}

export interface TrackPOI {
  type: "gas" | "toilet" | "motel" | "shop" | "rest";
  name: string;
  point: [number, number];
}

export interface TrackDay {
  dayNumber: number;
  distanceKm: number;
  climbM: number;
  points: [number, number][];
}

export interface TrackComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Track {
  id: string;
  name: string;
  surfaceType: SurfaceType;
  country: string;
  countryCode: string;
  state: string | null;
  area: string;
  distanceKm: number;
  climbM: number;
  descentM: number;
  hasBusyRoads: boolean;
  days: TrackDay[];
  points: [number, number][];
  airQuality: { aqi: number; label: AirQualityLabel };
  hazards: TrackHazard[];
  pois: TrackPOI[];
  basedOnEventId: string | null;
  favorite?: boolean;
  likes: number;
  liked?: boolean;
  comments: TrackComment[];
}

export interface TrackFilters {
  location?: string;
  countryCode?: string;
  surfaceType?: SurfaceType | null;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minClimbM?: number;
  maxClimbM?: number;
  multiDayOnly?: boolean;
  avoidBusyRoads?: boolean;
}

// Bounds for the distance/climb range sliders on the Find Tracks filter sheet. Product
// vocabulary, not data — they define what the control can express, not what exists.
export const DISTANCE_MIN = 1;
export const DISTANCE_MAX = 350;
export const CLIMB_MIN = 0;
export const CLIMB_MAX = 3500;
