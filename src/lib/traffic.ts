// Mock traffic condition for an event's day — green ("ok") / red ("bad"), asked for directly:
// "short but gren ok red bad." Same illustrative-until-a-provider-exists pattern as
// lib/air-quality.ts — a real source (Google Maps traffic data, or similar) is a later
// decision, not made here — see plan/server-tasks.md. Deterministic by event id + date.

export type TrafficLevel = "ok" | "bad";

export interface TrafficReading {
  level: TrafficLevel;
  label: string;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function getEventTraffic(eventId: string, dateIso: string | null): TrafficReading {
  const hash = hashString(`${eventId}-traffic-${dateIso?.slice(0, 10) ?? "unknown"}`);
  const bad = hash % 5 === 0; // mostly clear, occasionally busy — not a coin flip
  return bad
    ? { level: "bad", label: "Busy roads expected" }
    : { level: "ok", label: "Roads clear" };
}
