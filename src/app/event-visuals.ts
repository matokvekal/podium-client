// Shared presentation logic for EventTile and EventCard — one place for "how does an event
// look as a card" so the home row and the Other Rides list read as the same design system.

import type { EventStatus } from "../lib/local-db";

function hashSeed(seed: string | null | undefined): number {
  const s = seed ?? "";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0;
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
  if (status === "published" || status === "registration_open" || status === "ready") {
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

export function placeholderColorVar(seed: string | null | undefined): string {
  const token = PLACEHOLDER_TOKENS[hashSeed(seed) % PLACEHOLDER_TOKENS.length];
  return `var(${token})`;
}

type CoverMood = "pastel" | "neon";

function coverMood(seed: string | null | undefined): CoverMood {
  return hashSeed(seed) % 2 === 0 ? "pastel" : "neon";
}

/**
 * Shared cover style for event placeholders (no uploaded cover image yet).
 * Deterministic per-event, but alternates between pastel and neon moods.
 */
export function placeholderCoverGradient(seed: string | null | undefined): string {
  const baseA = PLACEHOLDER_TOKENS[hashSeed(seed) % PLACEHOLDER_TOKENS.length];
  const baseB = PLACEHOLDER_TOKENS[(hashSeed(seed) + 3) % PLACEHOLDER_TOKENS.length];

  if (coverMood(seed) === "pastel") {
    return `linear-gradient(135deg, color-mix(in srgb, var(${baseA}) 34%, white 66%) 0%, color-mix(in srgb, var(${baseB}) 42%, white 58%) 100%)`;
  }

  return `linear-gradient(135deg, color-mix(in srgb, var(${baseA}) 80%, #05070c 20%) 0%, color-mix(in srgb, var(${baseB}) 72%, #05070c 28%) 100%)`;
}

export function eventCoverBackground(
  seed: string | null | undefined,
  coverImageDataUrl: string | null | undefined,
): string {
  if (!coverImageDataUrl) return placeholderCoverGradient(seed);
  const safeUrl = coverImageDataUrl.replaceAll('"', "%22");
  return `linear-gradient(180deg, rgba(5, 7, 12, 0.18) 0%, rgba(5, 7, 12, 0.52) 100%), url("${safeUrl}")`;
}

export function initialOf(name: string | null | undefined): string {
  return (name ?? "").trim().charAt(0).toUpperCase() || "?";
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
// anywhere else yet. A card for someone else's ride therefore has real data for neither.
//
// It used to fill that hole with a deterministic fake: a club name hashed out of the event id
// and a random-but-stable difficulty. That is gone. A fabricated club name on a REAL event is
// worse than a blank one — a rider cannot tell it apart from the truth, and it attributes a
// stranger's ride to an organization that never ran it. Callers now show the real value or
// omit the field.
