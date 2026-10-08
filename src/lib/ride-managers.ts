// Ride MANAGERS (server: eventManagers.service.ts, sql/059) — people the ride's creator names by
// email to run the ride with them. A manager does everything the creator does (edit, route,
// riders, groups, cancel); only the creator adds or removes managers. An email with no account
// yet waits until that person first signs in with Google.

import { apiRequest } from "./api-client";
import type { EventSummary } from "./local-db";

export interface RideManager {
  userId: number;
  name: string | null;
  email: string | null;
}

/** GET /events/:eventId/managers's `data`. */
export interface RideManagersView {
  owner: { userId: number; name: string | null } | null;
  managers: RideManager[];
  /** Emails nobody has signed in with yet. */
  pending: { email: string; createdAt: string }[];
  /** The server's answer to "may this viewer add / remove" — the creator only. */
  canManage: boolean;
}

export type AddRideManagerResult =
  | { status: "added"; manager: RideManager }
  | { status: "invited" };

export function fetchRideManagers(eventId: string): Promise<RideManagersView> {
  return apiRequest<RideManagersView>(`/events/${eventId}/managers`);
}

export function addRideManager(eventId: string, email: string): Promise<AddRideManagerResult> {
  return apiRequest<AddRideManagerResult>(`/events/${eventId}/managers`, {
    method: "POST",
    body: { email },
  });
}

export function removeRideManager(eventId: string, userId: number): Promise<void> {
  return apiRequest<void>(`/events/${eventId}/managers/${userId}`, { method: "DELETE" });
}

export function removeRideManagerInvite(eventId: string, email: string): Promise<void> {
  return apiRequest<void>(`/events/${eventId}/manager-invites/${encodeURIComponent(email)}`, {
    method: "DELETE",
  });
}

/**
 * "A ride I organize": I created it, or its creator made me a manager. `myRole` comes from
 * GET /events (the caller's own list); ownerId covers a cached row from an older server.
 */
export function isMyOrganizedRide(
  ride: Pick<EventSummary, "ownerId" | "myRole">,
  profileId: number | null | undefined,
): boolean {
  if (ride.myRole === "owner" || ride.myRole === "operator") return true;
  return profileId != null && ride.ownerId === profileId;
}
