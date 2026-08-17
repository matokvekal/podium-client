// Shared presentation logic for EventTile and EventCard — one place for "how does an event
// look as a card" so the home row and the Other Rides list read as the same design system.

import type { EventStatus } from "../lib/local-db";
import { LEVELS, type RiderLevel } from "../lib/rider-level";

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Upcoming",
  registration_open: "Open",
  ready: "Ready",
  live: "Live",
  finished: "Finished",
  cancelled: "Cancelled",
};

export function statusLabel(status: EventStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export type FigmaStatus = "live" | "upcoming" | "finished";

export const FIGMA_TAG_LABEL: Record<FigmaStatus, string> = {
  live: "Live",
  upcoming: "Upcoming",
  finished: "Finished",
};

/** live -> Live (happening now), finished/cancelled -> Finished, everything else
 * (draft/published/registration_open/ready) -> Upcoming (open, not yet under way).
 *
 * Named "live"/"upcoming" rather than the original Figma mock's "active"/"on progress" —
 * those read backwards in plain English (a not-yet-started event called "Active" while the
 * one actually happening now is merely "On Progress") and directly contradicted the Find
 * tabs' own filter labels once those existed. Same colour per bucket as before, label only.
 * Shared by EventCard's tag and EventsListPage's Find filter pills so both always agree. */
export function figmaStatus(status: EventStatus): FigmaStatus {
  if (status === "live") return "live";
  if (status === "finished" || status === "cancelled") return "finished";
  return "upcoming";
}

export function statusBadgeClass(status: EventStatus): string {
  if (status === "live") return "badge badge--live";
  if (
    status === "published" ||
    status === "registration_open" ||
    status === "ready"
  ) {
    return "badge badge--pending";
  }
  if (status === "finished") return "badge badge--finished";
  if (status === "cancelled") return "badge badge--danger";
  return "badge";
}

// No cover-image field exists on an event yet, so cards get an honest abstract placeholder
// instead of a fake photo: an initial on a colour picked deterministically from the event's
// own id, so the same event always looks the same. Colours come from the existing --status-*
// and --accent tokens — never a new hardcoded hex — so the placeholder still respects
// light/dark and the competition display mode automatically.
const PLACEHOLDER_TOKENS = [
  "--accent",
  "--status-live",
  "--status-pending",
  "--status-finished",
  "--status-danger",
  "--status-stale",
];

export function placeholderColorVar(seed: string): string {
  const token = PLACEHOLDER_TOKENS[hashSeed(seed) % PLACEHOLDER_TOKENS.length];
  return `var(${token})`;
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// "the event we came from need glow shadow under for 10 seconds to know where we came from" —
// a card records itself here the instant it's clicked (EventCard.tsx/EventTile.tsx), and
// EventsListPage.tsx reads + clears it once on mount. sessionStorage (not a store) specifically
// because it has to survive the full unmount/remount round trip through EventDetailPage and
// back via browser/back-arrow navigation, which a plain in-memory store would lose.
const LAST_OPENED_KEY = "podium.lastOpenedEventId";

export function recordOpenedEvent(id: string): void {
  try {
    sessionStorage.setItem(LAST_OPENED_KEY, id);
  } catch {
    // sessionStorage unavailable (private mode, disabled) — the "came back from" glow just
    // won't show; nothing else here depends on it.
  }
}

/** Reads and clears in one step — the glow is only ever meant to fire once per return trip. */
export function consumeOpenedEventId(): string | null {
  try {
    const id = sessionStorage.getItem(LAST_OPENED_KEY);
    if (id) sessionStorage.removeItem(LAST_OPENED_KEY);
    return id;
  } catch {
    return null;
  }
}

// Level and organizer/club name are client-only (see store/eventExtrasStore.ts) — set on the
// organizer's own device when they create the event, with no server column to sync them
// anywhere else yet. That means a card for someone else's ride, on someone else's device, has
// real data for neither. Rather than show a hole where "who's running this / how hard is it"
// should be, cards fall back to a deterministic mock pick — asked for directly ("if you dont
// see data ad to mock those fields"). Same "hash the id, pick something plausible" trick as
// lib/mock-participants.ts's seedParticipantCount and lib/mock-results.ts's route generation.
// Never overrides real data — callers do `extras.level ?? mockLevel(event.id)`, real data
// first.
const MOCK_CLUBS = [
  "Galilee Cycling Club",
  "Negev Gravel Collective",
  "Sharon Road Team",
  "Jerusalem Hills Riders",
  "Tel Aviv Coastal Spinners",
  "Carmel MTB Crew",
];

export function mockOrganizerName(eventId: string): string {
  return MOCK_CLUBS[hashSeed(eventId) % MOCK_CLUBS.length];
}

export function mockLevel(eventId: string): RiderLevel {
  return LEVELS[hashSeed(eventId) % LEVELS.length].value;
}
