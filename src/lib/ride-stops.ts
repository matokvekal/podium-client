// Ride stop points (server: sql/049, /events/:eventId/stops) — the coffee / break stops a
// ride's creator places on its map. The pieces with no React in them, so the URL building,
// search parsing and distance maths are testable on their own.
//
// NOT events.restStops: that is a typed NUMBER on the ride form (sql/022) and stays exactly as
// it was. These are places, owned by the ride (not the track — a copied track does not bring
// another organizer's coffee stops with it).
//
// PLACE SEARCH is OpenStreetMap's Nominatim (free, no key, no billing — same "no-key external
// fetch" pattern as lib/weather.ts's Open-Meteo). Its usage policy allows at most one request
// per second and forbids autocomplete, so the client searches only when the creator presses
// Search, never per keystroke. Navigation still opens Google Maps with a plain lat,lng URL
// (lib/nav-links.ts), which needs no key either.

import { apiRequest } from "./api-client";
import { haversineDistanceKm, nearestPointOnRoute } from "./geo";
import { googleMapsUrl } from "./nav-links";

export type RideStopKind = "coffee" | "water" | "food" | "regroup" | "other";

/** One stop as the server sends it. */
export interface RideStop {
  id: number;
  rideId: string;
  label: string;
  lat: number;
  lng: number;
  kind: RideStopKind;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RideStopsLimits {
  maxStops: number;
  maxLabelLength: number;
}

/** GET /events/:eventId/stops's `data`. */
export interface RideStopsView {
  stops: RideStop[];
  /** The server's answer to "may this viewer change stops" (the ride's creator only). */
  canManage: boolean;
  limits: RideStopsLimits;
}

/** Mirrors the server's defaults, for before the first response. The server's `limits` win. */
export const DEFAULT_RIDE_STOPS_LIMITS: RideStopsLimits = { maxStops: 5, maxLabelLength: 120 };

export const RIDE_STOP_KIND_ICON: Record<RideStopKind, string> = {
  coffee: "☕",
  water: "💧",
  food: "🥪",
  regroup: "🚩",
  other: "📍",
};

// ---- API -----------------------------------------------------------------------------------

export function fetchRideStops(eventId: string): Promise<RideStopsView> {
  return apiRequest<RideStopsView>(`/events/${eventId}/stops`);
}

export function createRideStop(
  eventId: string,
  input: { label: string; lat: number; lng: number; kind?: RideStopKind },
): Promise<RideStop> {
  return apiRequest<RideStop>(`/events/${eventId}/stops`, { method: "POST", body: input });
}

export function updateRideStop(
  eventId: string,
  stopId: number,
  patch: Partial<Pick<RideStop, "label" | "lat" | "lng" | "kind" | "sortOrder">>,
): Promise<RideStop> {
  return apiRequest<RideStop>(`/events/${eventId}/stops/${stopId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteRideStop(eventId: string, stopId: number): Promise<void> {
  return apiRequest<void>(`/events/${eventId}/stops/${stopId}`, { method: "DELETE" });
}

// ---- place search (Nominatim) ---------------------------------------------------------------

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

export interface PlaceResult {
  /** Nominatim's own name for the place — shown in the result list only. The stop keeps the
   * creator's text as its label. */
  name: string;
  lat: number;
  lng: number;
}

/**
 * The search URL. `near` (the route) adds a viewbox so places along the ride rank first — a
 * preference, not a fence (`bounded` is off), so a café just outside the box is still found.
 */
export function buildPlaceSearchUrl(text: string, near: readonly [number, number][] = []): string {
  const params = new URLSearchParams({
    q: text.trim(),
    format: "jsonv2",
    limit: "5",
    "accept-language": "he,en",
  });
  if (near.length > 0) {
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    for (const [lat, lng] of near) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
    // A little margin around the route: stops are often just off the line.
    const pad = 0.05;
    params.set(
      "viewbox",
      [minLng - pad, maxLat + pad, maxLng + pad, minLat - pad].map((n) => n.toFixed(5)).join(","),
    );
  }
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

/** Nominatim's JSON → results. Anything malformed is dropped, never guessed. */
export function parsePlaceResults(body: unknown): PlaceResult[] {
  if (!Array.isArray(body)) return [];
  const out: PlaceResult[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const lat = Number(rec.lat);
    const lng = Number(rec.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const name = typeof rec.display_name === "string" ? rec.display_name : `${lat}, ${lng}`;
    out.push({ name, lat, lng });
  }
  return out;
}

/** One search. Throws on a network / HTTP failure so the caller can say "search failed". */
export async function searchPlaces(
  text: string,
  near: readonly [number, number][] = [],
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  if (!text.trim()) return [];
  const response = await fetch(buildPlaceSearchUrl(text, near), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  return parsePlaceResults(await response.json());
}

// ---- display helpers ------------------------------------------------------------------------

/**
 * Only well-formed stops from a GET response — a numeric id, a string label and a finite, in-range
 * position. Anything else is dropped rather than drawn at a wrong place or shown as "km NaN".
 */
export function sanitizeRideStops(value: unknown): RideStop[] {
  if (!Array.isArray(value)) return [];
  const kinds = Object.keys(RIDE_STOP_KIND_ICON);
  const out: RideStop[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const s = item as Partial<RideStop>;
    if (typeof s.id !== "number" || !Number.isFinite(s.id)) continue;
    if (typeof s.label !== "string" || !s.label.trim()) continue;
    if (typeof s.lat !== "number" || !Number.isFinite(s.lat) || Math.abs(s.lat) > 90) continue;
    if (typeof s.lng !== "number" || !Number.isFinite(s.lng) || Math.abs(s.lng) > 180) continue;
    out.push({
      ...(s as RideStop),
      kind: typeof s.kind === "string" && kinds.includes(s.kind) ? s.kind : "coffee",
    });
  }
  return out;
}

/** How long one place search may take before the creator is told it failed. */
export const PLACE_SEARCH_TIMEOUT_MS = 10_000;

/** "Open in Google Maps" for one stop — a plain lat,lng destination, no API key. */
export function stopGoogleMapsUrl(stop: Pick<RideStop, "lat" | "lng">): string {
  // googleMapsUrl only returns null when given neither a location nor a point.
  return googleMapsUrl(null, [stop.lat, stop.lng]) as string;
}

/** Stops further than this from the line get no "km N" — they are not really "on" the route. */
const ON_ROUTE_MAX_KM = 1;

/**
 * How far along the route a stop is, in km, rounded to 0.1 — or null when there is no route or
 * the stop is more than 1 km off it.
 */
export function kmAlongRoute(
  points: readonly [number, number][],
  stop: Pick<RideStop, "lat" | "lng">,
): number | null {
  if (points.length < 2) return null;
  const target: [number, number] = [stop.lat, stop.lng];
  const { index, point } = nearestPointOnRoute(points, target);
  if (index < 0 || haversineDistanceKm(point, target) > ON_ROUTE_MAX_KM) return null;
  let km = 0;
  for (let i = 1; i <= index; i++) km += haversineDistanceKm(points[i - 1], points[i]);
  km += haversineDistanceKm(points[index], point);
  return Math.round(km * 10) / 10;
}

/** The server's error text without its "(CODE)" suffix, for a short inline message. */
export function stopErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  const clean = message.replace(/\s*\([A-Z_]+\)\s*$/, "").trim();
  return clean || fallback;
}
