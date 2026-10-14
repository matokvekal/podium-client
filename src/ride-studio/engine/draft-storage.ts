/**
 * Where the unfinished ride lives: this device's localStorage, one slot per signed-in user.
 *
 * Deliberately NOT the server. The server's `draft` event status would create a real events row
 * (visible in My Rides, counted against the weekly create limit), which is exactly the
 * "partially published ride" Ride Studio must never leave behind. A draft here is a private
 * note on this device until the organizer confirms on the review screen; only then does one
 * request create the ride.
 *
 * Every storage call is guarded: private windows and blocked storage throw, and the studio must
 * keep working (without saving) rather than break.
 */

import { draftHasContent, parseStoredDraft } from "./draft";
import type { RideDraft } from "./types";

const PREFIX = "podium.rideStudio.draft.";

export function draftStorageKey(userId: number | string): string {
  return `${PREFIX}${userId}`;
}

export function loadDraft(
  userId: number | string,
  storage: Storage | null = safeStorage(),
): RideDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftStorageKey(userId));
    return raw ? parseStoredDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Saves a draft that has anything in it; an empty one clears the slot instead. Returns whether
 *  the write went through. */
export function saveDraft(
  userId: number | string,
  draft: RideDraft,
  storage: Storage | null = safeStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (!draftHasContent(draft)) {
      storage.removeItem(draftStorageKey(userId));
      return true;
    }
    storage.setItem(draftStorageKey(userId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(userId: number | string, storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(draftStorageKey(userId));
  } catch {
    /* nothing to clear */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
