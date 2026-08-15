// Mock air quality for an event's day — same illustrative-until-a-provider-exists pattern as
// Find Tracks' Track.airQuality (mock-tracks.ts), applied to events too, asked for directly
// ("each ride need the air polution conditon (you did) ... mock it"). No real provider chosen
// — a Google Air Quality API call, or a national source, is a later decision, not made here —
// see plan/server-tasks.md.
//
// Deterministic by event id + date, so it doesn't reshuffle on every reload — same trick
// lib/mock-results.ts and lib/mock-participants.ts already use.

export type AirQualityLabel = "Good" | "Moderate" | "Unhealthy";

export interface AirQualityReading {
  label: AirQualityLabel;
  aqi: number;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function getEventAirQuality(eventId: string, dateIso: string | null): AirQualityReading {
  const hash = hashString(`${eventId}-${dateIso?.slice(0, 10) ?? "unknown"}`);
  const aqi = 15 + (hash % 120); // 15-134, weighted toward the "Good"/"Moderate" range
  const label: AirQualityLabel = aqi < 50 ? "Good" : aqi < 100 ? "Moderate" : "Unhealthy";
  return { label, aqi };
}
