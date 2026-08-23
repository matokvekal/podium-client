// Find Tracks — the shape of a PUBLIC ROUTE, exactly as the server sends it.
//
// This file used to describe an imaginary "Track" with air-quality readings, hazard markers,
// points of interest, multi-day stages, likes and comments. None of that has a server field,
// and the store behind it returned a hardcoded empty array, so the planner could never show
// anything at all. Both are gone: the type below is a one-to-one mirror of the real response
// from GET /api/v1/routes/public (podium-server's routeLibrary.controller.ts, toRouteSummary),
// and nothing is declared here that the server does not actually send.
//
// Fields the old type had and the API genuinely does NOT provide — so they are not modelled,
// not defaulted, and not rendered anywhere:
//
//   country / countryCode   routes carry only `placeName`, a free-text place. There is no
//                           country column, so there is no flag and no country filter.
//   difficulty / level      no column on a route. Difficulty is an EVENT concept here.
//   descentM                only total climb (`elevationM`) is stored.
//   days / multi-day        one route is one line; there are no stages.
//   airQuality / hazards    no provider exists for any of these, and inventing a safety
//   / pois                  reading on a real route is the one thing this app must not do.
//   likes / comments        no social endpoints exist.

import type { SurfaceType } from "./surface-types";

/**
 * The route library's own taxonomy. Deliberately NOT SurfaceType: the server's ROUTE_TYPES
 * (db/types.ts) is road | gravel | mtb | mixed, while an event's activity type adds running
 * and hiking and has no "mixed". Mapping one onto the other would either invent a surface for
 * a mixed route or silently drop running/hiking, so the two stay separate and each is labelled
 * on its own terms.
 */
export type RouteType = "road" | "gravel" | "mtb" | "mixed";

export const ROUTE_TYPES: RouteType[] = ["road", "gravel", "mtb", "mixed"];

export const ROUTE_TYPE_LABEL: Record<RouteType, string> = {
  road: "Road",
  gravel: "Gravel",
  mtb: "MTB",
  mixed: "Mixed",
};

/** The three route types that also exist as an event activity type, for the create handoff. */
export const ROUTE_TYPE_TO_SURFACE: Partial<Record<RouteType, SurfaceType>> = {
  road: "road",
  gravel: "gravel",
  mtb: "mtb",
};

export interface RouteBbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** One row of GET /routes/public — a browse card, without the full point list. */
export interface PublicRoute {
  id: number;
  ownerId: number | null;
  /** Resolved server-side from the owner's account. Null for a legacy/ownerless route. */
  ownerName: string | null;
  name: string | null;
  routeType: RouteType | null;
  source: string | null;
  /** Free-text place the owner typed. The only location data a route carries. */
  placeName: string | null;
  isPublic: boolean;
  distanceKm: number | null;
  /** Total climb. There is no per-point elevation series — see EventDetailPage's route card. */
  elevationM: number | null;
  pointCount: number | null;
  /** A thinned line for the card thumbnail, not the full route. */
  previewPoints: [number, number][] | null;
  markers: unknown;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  bbox: RouteBbox | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What GET /routes/public accepts (routeLibrary.schemas.ts's publicRoutesQuerySchema). Only
 * these are sent to the server; anything the planner wants to offer beyond them would be a
 * client-side pass over an already-fetched page, and is called out as such where it happens.
 */
export interface TrackFilters {
  /** Matched server-side against both place_name and name. */
  place?: string;
  routeType?: RouteType | null;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minClimbM?: number;
  maxClimbM?: number;
}

// Bounds for the distance/climb range sliders. Product vocabulary, not data — they define what
// the control can express, not what exists.
export const DISTANCE_MIN = 1;
export const DISTANCE_MAX = 350;
export const CLIMB_MIN = 0;
export const CLIMB_MAX = 3500;
