// Local-first event cache — IndexedDB via idb.
//
// Read priority everywhere this is used: this cache first (instant, works offline), then
// whatever the network returns to refresh it in the background. The network is still the
// source of truth; this only makes the first paint instant and keeps the list usable when
// the server is unreachable — see plan/03-progress.md's 2026-08-14 entries.
//
// One object store, `events`, keyed by event id. Every row also carries which list it was
// last seen in (`source`) so a read can ask "what did I last see for the guest public list"
// without a second store, and when it was cached, so callers can show it as stale.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export type EventStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "ready"
  | "live"
  | "finished"
  | "cancelled";

export interface EventSummary {
  id: string;
  code: string;
  name: string;
  type: "RIDE" | "RACE";
  status: EventStatus;
  visibility: "public" | "private";
  displayMode: "standard" | "competition";
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  /** Optional — not yet in the frozen API contract; older/unmigrated events won't have it. */
  area?: string | null;
  ownerId: number | null;
  /** Owner's nickname if set, else "first last" (either half optional), else null — resolved
   * server-side (event.queries.ts). Null for a legacy/ownerless event or an owner who set
   * neither. */
  ownerName: string | null;
  /** Owner's Google profile photo, or null for legacy/ownerless events and any owner who
   * hasn't signed in with Google. */
  ownerAvatarUrl: string | null;
  /**
   * Client-only, not part of any server response — there is no server field for it yet.
   * Lives entirely in this cache; see toggleFavorite. Optional because a fresh row straight
   * off the network never has it set until toggled.
   */
  favorite?: boolean;
  /**
   * Client-only, same as `favorite` — no server column exists for either yet (see
   * plan/server-tasks.md). Only ever set on mock data; a real event from the API just won't
   * have these until a route is attached server-side.
   */
  distanceKm?: number;
  climbM?: number;
}

/** "mine" — GET /events?filter=, signed in. "guest" — GET /events/public, signed out. */
export type EventSource = "mine" | "guest";

interface CachedEvent extends EventSummary {
  source: EventSource;
  cachedAt: number;
}

interface PodiumDB extends DBSchema {
  events: {
    key: string;
    value: CachedEvent;
    indexes: { source: EventSource };
  };
}

let dbPromise: Promise<IDBPDatabase<PodiumDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PodiumDB>> {
  dbPromise ??= openDB<PodiumDB>("podium-db", 1, {
    upgrade(db) {
      const store = db.createObjectStore("events", { keyPath: "id" });
      store.createIndex("source", "source");
    },
  });
  return dbPromise;
}

/** Everything last cached for one source, most-recently-cached first. */
export async function getCachedEvents(source: EventSource): Promise<EventSummary[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllFromIndex("events", "source", source);
    return rows.sort((a, b) => b.cachedAt - a.cachedAt);
  } catch {
    // IndexedDB unavailable (private mode, disabled) — the app still works, it just loses
    // the instant cold-start paint and falls back to whatever the network returns.
    return [];
  }
}

/**
 * Deletes every cached row for one source — used on sign-out so a shared device never briefly
 * shows the previous rider's cached "mine" rows to whoever signs in next. Best effort, same as
 * every other function here: IndexedDB unavailable should never throw up to the caller.
 */
export async function clearCachedEvents(source: EventSource): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("events", "readwrite");
    const existing = await tx.store.index("source").getAll(source);
    await Promise.all([...existing.map((row) => tx.store.delete(row.id)), tx.done]);
  } catch {
    // Best effort — a failed cache clear should never break sign-out.
  }
}

export async function getCachedEvent(id: string): Promise<EventSummary | null> {
  try {
    const db = await getDb();
    return (await db.get("events", id)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Replaces every row for this source with exactly what the server just returned — a full
 * replace, not a merge, EXCEPT for `favorite`: the server never sends that field at all, so
 * a naive replace would silently un-favorite everything on the next background refresh.
 * Carried over from whatever was cached before. Everything else about a row that dropped
 * out of the results (event went private, finished and aged out, whatever) still drops out
 * of the cache, not lingering forever.
 */
export async function putCachedEvents(source: EventSource, events: EventSummary[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("events", "readwrite");
    const existing = await tx.store.index("source").getAll(source);
    const favorites = new Map(existing.map((row) => [row.id, row.favorite === true]));
    const cachedAt = Date.now();
    await Promise.all([
      ...existing.map((row) => tx.store.delete(row.id)),
      ...events.map((event) =>
        tx.store.put({ ...event, source, cachedAt, favorite: favorites.get(event.id) ?? false }),
      ),
      tx.done,
    ]);
  } catch {
    // Best effort — a failed cache write should never break the actual list render.
  }
}

/**
 * Caches a single event whenever it's seen on its own — the detail page — so it survives
 * being reopened offline even if it never appeared in a list this device fetched. Keeps
 * whatever `source` and `favorite` it was already filed under, if any.
 */
export async function putCachedEvent(
  event: EventSummary,
  source: EventSource = "guest",
): Promise<void> {
  try {
    const db = await getDb();
    const existing = await db.get("events", event.id);
    await db.put("events", {
      ...event,
      source: existing?.source ?? source,
      cachedAt: Date.now(),
      favorite: existing?.favorite ?? false,
    });
  } catch {
    // Best effort, same as above.
  }
}

/** Toggles favorite for one event and returns the new value. A no-op (returns false) if
 * the event isn't cached yet — favoriting only makes sense on something already seen. */
export async function toggleFavorite(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    const existing = await db.get("events", id);
    if (!existing) return false;
    const favorite = !existing.favorite;
    await db.put("events", { ...existing, favorite });
    return favorite;
  } catch {
    return false;
  }
}
