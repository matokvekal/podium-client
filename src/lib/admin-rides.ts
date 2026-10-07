// The System Admin's per-ride rider-cap API (/api/v1/admin/rides, server sql/060). Same
// server-side gate as GET /api/v1/admin/analytics (requireAdminAnalytics).

import { apiRequest } from "./api-client";

export interface AdminRide {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  status: string;
  ownerId: number | null;
  ownerName: string | null;
  /** The organizer's account cap; null for an ownerless ride. */
  ownerLimit: number | null;
  /** The per-ride override; null = the organizer's account cap applies. */
  maxParticipants: number | null;
  /** Approved + still-pending riders — the count the cap is checked against. */
  participantCount: number;
}

/** The largest value the server's column (Postgres INTEGER) can hold — a technical bound, not a
 *  business cap. Mirrors PG_INTEGER_MAX in the server's schemas/adminRides.schemas.ts. */
export const PG_INTEGER_MAX = 2_147_483_647;

export function fetchAdminRides(): Promise<AdminRide[]> {
  return apiRequest<AdminRide[]>("/admin/rides");
}

/** `null` clears the override, so the ride goes back to the organizer's account cap. */
export function setRideMaxParticipants(
  eventId: string,
  maxParticipants: number | null,
): Promise<AdminRide> {
  return apiRequest<AdminRide>(`/admin/rides/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: { maxParticipants },
  });
}

/** The cap that applies right now: the override, else the account cap. */
export function effectiveRideLimit(ride: AdminRide): number | null {
  return ride.maxParticipants ?? ride.ownerLimit;
}

/**
 * What the Limit box holds → what to send. Blank means "no override". Anything else must be a
 * whole number from 1 up (PG_INTEGER_MAX is only the column's technical limit); commas/spaces
 * are allowed ("30,000").
 */
export function parseRiderLimitInput(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = raw.replace(/[\s,]/g, "");
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter a whole number" };
  const value = Number(text);
  if (value < 1) return { ok: false, error: "Enter 1 or more" };
  if (value > PG_INTEGER_MAX) return { ok: false, error: "That number is too large" };
  return { ok: true, value };
}

/** A ride's start as `dd/mm/yyyy HH:MM`, in the admin's local time. */
export function formatRideStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
