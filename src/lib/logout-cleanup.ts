// Full local reset for logout.
//
// Every persisted thing this app writes is namespaced `podium.*` (tokens, profile, and every
// Zustand persist store) or `elnino.*` (the colour-theme preference, the transient per-event
// session flags). Nothing this app owns is stored un-prefixed, and nothing this app owns is
// a cookie — the auth tokens live in localStorage (see lib/auth-storage.ts). So a prefix scan
// is exhaustive AND safe: Google's cookies and any unrelated site storage are never touched.
//
// The IndexedDB ride cache (podium-db) is cleared through its own module (lib/local-db.ts) —
// no second cleanup mechanism.
//
// Every step is independently guarded. If clearing one key, one store, or IndexedDB throws,
// the rest still run and the user still ends up logged out.

import { clearAllCaches } from "./local-db";

/** Keys this app owns. A key is fair game to delete iff it starts with one of these. */
export const OWNED_STORAGE_PREFIXES = ["podium.", "elnino."] as const;

export function isOwnedStorageKey(key: string): boolean {
  return OWNED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Pure: which of these keys this app owns. Extracted so it is unit-testable without a DOM. */
export function ownedStorageKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter(isOwnedStorageKey);
}

function wipeOwnedKeys(store: Storage): string[] {
  const removed: string[] = [];
  let keys: string[] = [];
  try {
    keys = Object.keys(store);
  } catch {
    // Accessing the store itself threw (private mode / storage disabled) — nothing to do.
    return removed;
  }
  for (const key of ownedStorageKeys(keys)) {
    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      // One key failing (quota weirdness, locked entry) must not stop the others.
    }
  }
  return removed;
}

export interface LogoutCleanupResult {
  /** localStorage keys actually removed. */
  localStorage: string[];
  /** sessionStorage keys actually removed. */
  sessionStorage: string[];
  /** True if the IndexedDB ride cache (podium-db) was cleared without error. */
  indexedDbCleared: boolean;
}

/**
 * Remove every trace of the signed-in user from this device: the auth tokens + cached
 * profile, every persisted Zustand store, the transient session flags, and the IndexedDB
 * ride cache. Only `podium.*` / `elnino.*` keys are removed.
 *
 * Note: this clears the *persisted* copy. In-memory Zustand state is discarded by the full
 * page navigation the caller does straight after (see AuthContext.signOut) — that is also
 * what stops any live geolocation watcher, poll loop or timer.
 */
export async function clearLocalUserData(): Promise<LogoutCleanupResult> {
  const result: LogoutCleanupResult = {
    localStorage: [],
    sessionStorage: [],
    indexedDbCleared: false,
  };

  if (typeof window !== "undefined") {
    try {
      result.localStorage = wipeOwnedKeys(window.localStorage);
    } catch {
      // ignore
    }
    try {
      result.sessionStorage = wipeOwnedKeys(window.sessionStorage);
    } catch {
      // ignore
    }
  }

  try {
    await clearAllCaches();
    result.indexedDbCleared = true;
  } catch {
    result.indexedDbCleared = false;
  }

  return result;
}
