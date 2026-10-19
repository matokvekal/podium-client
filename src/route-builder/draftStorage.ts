// The one Route Builder draft kept on this device, in localStorage.
//
// One draft, not a list: the builder is for making a route now, not a file manager. It survives
// navigation and refresh — including "Ride it now", until the ride is saved — and is removed
// only after a successful save, a saved ride, or the rider's own "Start over".
//
// Never silently lost: a draft too big for the budget, or a full storage quota, is reported to
// the page (which tells the rider to download a GPX) and the draft keeps living in memory.

import type { RouteDraft } from "./model";

export const DRAFT_STORAGE_KEY = "elnino.routeBuilder.draft.v1";
export const VIEW_STORAGE_KEY = "elnino.routeBuilder.view.v1";
/** Serialized size budget. A 120 km routed ride is a few hundred KB; this is room to spare. */
export const DRAFT_MAX_CHARS = 2 * 1024 * 1024;
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  draft: RouteDraft;
}

export type SaveDraftResult = { ok: true } | { ok: false; reason: "too-large" | "quota" };

export function saveDraft(draft: RouteDraft, now = Date.now()): SaveDraftResult {
  if (draft.waypoints.length === 0) {
    clearDraft();
    return { ok: true };
  }
  const text = JSON.stringify({ savedAt: now, draft } satisfies StoredDraft);
  if (text.length > DRAFT_MAX_CHARS) return { ok: false, reason: "too-large" };
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, text);
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

/** The stored draft, or null when there is none, it is older than a week, or unreadable. */
export function loadDraft(now = Date.now()): { draft: RouteDraft; savedAt: number } | null {
  let text: string | null;
  try {
    text = localStorage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const stored = JSON.parse(text) as Partial<StoredDraft>;
    if (typeof stored.savedAt !== "number" || !isDraftShape(stored.draft)) {
      clearDraft();
      return null;
    }
    if (now - stored.savedAt > DRAFT_MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    return { draft: stored.draft, savedAt: stored.savedAt };
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing was kept there to clear.
  }
}

function isDraftShape(value: unknown): value is RouteDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<RouteDraft>;
  if (!Array.isArray(d.waypoints) || !Array.isArray(d.segments)) return false;
  if (d.profile !== "road" && d.profile !== "mtb") return false;
  if (d.segments.length !== Math.max(0, d.waypoints.length - 1)) return false;
  return d.waypoints.every(
    (w) =>
      w &&
      typeof w.id === "string" &&
      Array.isArray(w.position) &&
      Number.isFinite(w.position[0]) &&
      Number.isFinite(w.position[1]),
  );
}

export interface StoredView {
  center: [number, number];
  zoom: number;
}

export function loadView(): StoredView | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) ?? "null") as StoredView | null;
    if (v && Array.isArray(v.center) && Number.isFinite(v.center[0]) && Number.isFinite(v.zoom))
      return v;
  } catch {
    // fall through
  }
  return null;
}

export function saveView(view: StoredView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // A remembered map position is a convenience; losing it costs nothing.
  }
}
