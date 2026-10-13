/**
 * Turns a finished draft into the exact request the ORIGINAL create form sends, so the server
 * sees nothing new: same endpoint, same fields, same defaults. Where the studio does not ask
 * a question, the field carries the value a fresh original form would have sent.
 *
 * Not shared with EventCreatePage on purpose: that 3,300-line page builds its body inline and
 * must not be refactored. Instead the e2e suite proves the two produce the same stored ride.
 */

import { descriptionForRequest } from "../../lib/event-limits";
import type { RideDraft } from "../engine/types";

/** The server's cap on points in one route (createEvent route schema: max 5000). */
export const ROUTE_MAX_POINTS = 5000;

export interface CreateRideBody {
  name: string;
  type: "RIDE";
  requiresBib: false;
  displayMode: "standard";
  visibility: "public" | "private";
  startsAt: string;
  location?: string;
  region?: string;
  country: string;
  description: string | null;
  requiresApproval: boolean;
  showParticipants: true;
  activityType: NonNullable<RideDraft["activityType"]>;
  elevationGainM: number | null;
  meetingPoint: null;
  durationMin: null;
  restStops: null;
  isAccessible: false;
  hasSupportVehicle: false;
  organizerGroup: null;
  autoCheckIn: true;
  chatEnabled: true;
  expectedParticipants: null;
  terrainGrade: null;
  routeDifficulty: null;
  season: null;
  shade: null;
  rideImageKey: string | null;
  joinAsRider: boolean;
}

export class IncompleteDraftError extends Error {
  constructor(readonly missing: string[]) {
    super(`The ride is not complete yet: ${missing.join(", ")}`);
  }
}

/** The climb the ride advertises: the track's own figure, or null when there is none. */
export function climbOf(route: RideDraft["route"]): number | null {
  const climb = route?.route.elevationM;
  return typeof climb === "number" && Number.isFinite(climb) && climb >= 0 ? climb : null;
}

export function buildCreateBody(draft: RideDraft): CreateRideBody {
  const missing: string[] = [];
  if (!draft.activityType) missing.push("activityType");
  if (!draft.visibility) missing.push("visibility");
  if (!draft.country) missing.push("country");
  const startsAt = new Date(draft.startsAt);
  if (!draft.startsAt || Number.isNaN(startsAt.getTime())) missing.push("startsAt");
  if (!draft.name.trim()) missing.push("name");
  if (missing.length > 0 || !draft.activityType || !draft.visibility || !draft.country) {
    throw new IncompleteDraftError(missing);
  }

  const location = draft.place.trim();
  return {
    name: draft.name.trim(),
    type: "RIDE",
    requiresBib: false,
    displayMode: "standard",
    visibility: draft.visibility,
    // The draft holds the organizer's wall-clock time; the ISO string is that instant in the
    // device's own time zone — exactly how the original form converts it.
    startsAt: startsAt.toISOString(),
    ...(location ? { location } : {}),
    ...(draft.country === "IL" && draft.region ? { region: draft.region } : {}),
    country: draft.country,
    description: descriptionForRequest(draft.description),
    // "Approve each rider" only applies to public rides (the original form hides it otherwise).
    requiresApproval: draft.visibility === "public" ? draft.requiresApproval : false,
    showParticipants: true,
    activityType: draft.activityType,
    elevationGainM: climbOf(draft.route),
    meetingPoint: null,
    durationMin: null,
    restStops: null,
    isAccessible: false,
    hasSupportVehicle: false,
    organizerGroup: null,
    autoCheckIn: true,
    chatEnabled: true,
    expectedParticipants: null,
    terrainGrade: null,
    routeDifficulty: null,
    season: null,
    shade: null,
    rideImageKey: draft.coverKey,
    joinAsRider: draft.joinAsRider,
  };
}

/** The body for POST /events/:id/route — the same geometry body the original form sends, reduced
 *  to the server's point cap with the elevation series kept aligned. */
export function buildRouteBody(route: NonNullable<RideDraft["route"]>): {
  points: [number, number][];
  distanceKm: number;
  elevationM: number | null;
  elevations?: (number | null)[];
} {
  const { points, elevations, distanceKm, elevationM } = route.route;
  const keep = pickIndices(points.length, ROUTE_MAX_POINTS);
  const aligned = elevations && elevations.length === points.length ? elevations : null;
  return {
    points: keep.map((i) => points[i]),
    distanceKm,
    elevationM,
    ...(aligned ? { elevations: keep.map((i) => aligned[i]) } : {}),
  };
}

/** Even-stride indices that always keep the first and last point. */
export function pickIndices(length: number, max: number): number[] {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const out = [0];
  const slots = max - 2;
  const interior = length - 2;
  for (let s = 0; s < slots; s++) out.push(1 + Math.floor((s * interior) / slots));
  out.push(length - 1);
  return out;
}
