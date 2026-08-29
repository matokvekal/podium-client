// Local-first event cache — IndexedDB via idb.
//
// Read priority everywhere this is used: this cache first (instant, works offline), then
// whatever the network returns to refresh it in the background. The network is still the
// source of truth; this only makes the first paint instant and keeps the list usable when
// the server is unreachable — see plan/03-progress.md's 2026-08-14 entries.
//
// v1 had one object store, `events` (the list cache): every row carries which list it was last
// seen in (`source`) so a read can ask "what did I last see for the guest public list" without
// a second store, and when it was cached, so callers can show it as stale.
//
// v2 adds the four stores that make a ride actually USABLE offline rather than merely listed.
// The list cache alone was never enough: it holds an EventSummary, so opening a ride with the
// server down produced a detail page whose isPaused/requiresApproval/showParticipants and, worst
// of all, myParticipant had to be invented by the page (see EventDetailPage's
// detailFromCachedSummary) — a rider's own approval state guessed as "not joined". The route,
// the roster and the last live positions had no persistence at all.
//
//   eventDetails      full GET /events/:id response, including the viewer's own membership
//   eventRoutes       full GET /events/:id/route — every point, which is why this is IndexedDB
//                     and not localStorage (a few thousand [lat,lng] pairs per ride)
//   eventParticipants GET /events/:id/participants, with the approval + arrival axes
//   eventLive         the last GET /events/:id/live riders actually received
//
// Every v2 row is scoped to the viewer who fetched it (`userId`, 0 for signed-out) and stamped
// with `lastSyncedAt`. Reads REQUIRE a matching userId, so one rider's private ride can never
// be served to whoever signs in next even if the sign-out clear failed to run.
//
// Nothing here ever fabricates: a row exists only because the server returned exactly that
// payload to this viewer at `lastSyncedAt`.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { EventRoute } from "./event-route";
import type { LiveRider } from "./live-types";
import type { AttendanceStatus, RegistrationStatus } from "./participant-types";
import type { RiderLevel } from "./rider-level";
import type { SurfaceType } from "./surface-types";
import type { UserVisualAsset } from "./user-identity";

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
   * The owner's persistent visual identity (lib/user-identity.ts), flat on the summary to match
   * how ownerName/ownerAvatarUrl are already sent here. Optional because NO server sends them
   * yet — a v1 cached row and every response from today's API simply omit them, and the cover
   * chain falls through to the same picture it shows now.
   */
  ownerAvatar?: UserVisualAsset | null;
  ownerCover?: UserVisualAsset | null;
  /**
   * Real server fields on the SUMMARY, not just the detail — the server's toEventSummary
   * (event.controller.ts) has been sending all four for a while; they simply were never typed
   * here, so every card fell back to store/eventExtrasStore.ts's localStorage copy. That copy
   * only ever exists on the device that CREATED the ride, which is why someone else's ride
   * showed no surface type and no difficulty. Optional because a cached v1 row predates them.
   *
   * The enums match the server's ACTIVITY_TYPES / RIDER_LEVELS exactly (db/types.ts).
   */
  activityType?: SurfaceType | null;
  level?: RiderLevel | null;
  organizerGroup?: string | null;
  teamId?: string | null;
  /**
   * Client-only, not part of any server response — there is no server field for it yet.
   * Lives entirely in this cache; see toggleFavorite. Optional because a fresh row straight
   * off the network never has it set until toggled.
   */
  favorite?: boolean;
  /**
   * Route + roster summary, sent by GET /events and GET /events/public (server's
   * toEventSummary) so a card shows Distance / Elevation / Riders without opening the event or
   * its route. `distanceKm` is the attached route's; `elevationGain` is the EFFECTIVE climb
   * (the organizer's manual/imported value, else the route's). Optional: a cached v1 row or a
   * response from an older server omits them, and the card falls back to the device-local copy
   * (store/eventExtrasStore.ts) then to a dash — never a fabricated number.
   */
  distanceKm?: number | null;
  elevationGain?: number | null;
  /** Approved + pending riders (rejected / left excluded), from the list response. */
  participantCount?: number | null;
  /** @deprecated device-local mirror of climb (store/eventExtrasStore.ts) — read
   *  `elevationGain` first. Kept so an older cached row still resolves. */
  climbM?: number;
}

/** "mine" — GET /events?filter=, signed in. "guest" — GET /events/public, signed out. */
export type EventSource = "mine" | "guest";

/** The viewer's own row on an event — the half of GET /events/:id that is about *you*. */
export interface MyParticipant {
  id: number;
  registrationStatus: RegistrationStatus;
  attendanceStatus: AttendanceStatus;
}

/**
 * The full GET /events/:eventId response. Lives here rather than in a page so the cache and
 * the pages that read it cannot drift apart — EventDetailPage and LiveEventPage both type
 * their server response with this.
 */
/** Who is running this ride, as GET /events/:eventId actually sends it. */
export interface EventOwner {
  id: number;
  /** "first last", else nickname, else null — resolved server-side. */
  name: string | null;
  /** Google profile photo, or null for an owner who never signed in with Google. */
  avatarUrl: string | null;
  /** The owner's chosen avatar/cover, once the server can carry them. Optional and absent
   * today; both fall through to the existing behaviour. See lib/user-identity.ts. */
  avatar?: UserVisualAsset | null;
  cover?: UserVisualAsset | null;
}

export interface EventDetail extends EventSummary {
  /**
   * The real organizer. The client used to read flat `ownerName`/`ownerAvatarUrl` fields that
   * NO event endpoint has ever sent — the server puts this data in a nested `owner` object
   * (event.controller.ts) — so the organizer line only ever appeared when this device happened
   * to have a club name in localStorage. Null for a legacy/ownerless event.
   */
  owner: EventOwner | null;
  requiresBib: boolean;
  description: string | null;
  finishedAt: string | null;
  isOwner: boolean;
  requiresApproval: boolean;
  isPaused: boolean;
  effectiveStatus: EventStatus;
  showParticipants: boolean;
  showLiveLocations: boolean;
  myParticipant: MyParticipant | null;
  /**
   * Start-list capacity, all resolved server-side and always present on a real
   * GET /events/:eventId response. `maxParticipants` is the event OWNER's entitlement;
   * `participantCount` is approved + pending; `isFull` is `participantCount >= maxParticipants`.
   * Client validation is UX only — the server 409s (EVENT_FULL) when a join hits the cap.
   * detailFromCachedSummary supplies honest fallbacks until the real fetch resolves.
   */
  participantCount: number;
  maxParticipants: number;
  isFull: boolean;
  /** Ride-groups count + the owner's per-event group entitlement. Optional: ride groups are a
   * client-only concept today (store/eventGroupsStore.ts), so a response may omit these. */
  groupCount?: number;
  maxGroups?: number;
}

/** One GET /events/:eventId/participants row, as far as any UI here needs it. */
export interface CachedParticipant {
  id: number;
  name: string | null;
  avatarUrl: string | null;
  /** Optional, absent today. Cached verbatim with the rest of the row, so an offline roster
   * keeps whatever identity the server last sent. See lib/user-identity.ts. */
  avatar?: UserVisualAsset | null;
  bib: string | null;
  registrationStatus: RegistrationStatus;
  attendanceStatus: AttendanceStatus;
}

/** What a cache read hands back: the payload plus when the server last confirmed it. */
export interface CacheHit<T> {
  value: T;
  lastSyncedAt: number;
}

interface UserScopedRow {
  /** Event id — the key path for every v2 store. */
  id: string;
  /** Which signed-in rider fetched this. 0 = signed out. See VIEWER_SIGNED_OUT. */
  userId: number;
  lastSyncedAt: number;
}

/** userId for a signed-out viewer. A real users.id is always a positive integer. */
export const VIEWER_SIGNED_OUT = 0;

/** Profile id → the userId these caches are keyed by. */
export function viewerKey(profileId: number | null | undefined): number {
  return profileId ?? VIEWER_SIGNED_OUT;
}

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
  eventDetails: {
    key: string;
    value: UserScopedRow & { detail: EventDetail };
    indexes: { userId: number };
  };
  eventRoutes: {
    key: string;
    /** `route: null` is a real answer — the server said this event has no route — and is
     *  cached as such, so an offline reopen shows the honest empty state, not a spinner. */
    value: UserScopedRow & { route: EventRoute | null };
    indexes: { userId: number };
  };
  eventParticipants: {
    key: string;
    value: UserScopedRow & { participants: CachedParticipant[] };
    indexes: { userId: number };
  };
  eventLive: {
    key: string;
    value: UserScopedRow & { riders: LiveRider[]; paused: boolean };
    indexes: { userId: number };
  };
}

/** The v2 stores — every one user-scoped, so sign-out clears exactly these. */
const USER_SCOPED_STORES = [
  "eventDetails",
  "eventRoutes",
  "eventParticipants",
  "eventLive",
] as const;

type UserScopedStore = (typeof USER_SCOPED_STORES)[number];

let dbPromise: Promise<IDBPDatabase<PodiumDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PodiumDB>> {
  dbPromise ??= openDB<PodiumDB>("podium-db", 2, {
    // Additive only: v1's `events` store and its rows survive the upgrade untouched, so an
    // existing install keeps its list cache and just gains the four new stores.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore("events", { keyPath: "id" });
        store.createIndex("source", "source");
      }
      if (oldVersion < 2) {
        for (const name of USER_SCOPED_STORES) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("userId", "userId");
        }
      }
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

// --- v2: the user-scoped ride caches ------------------------------------------------------
//
// Every accessor below is best-effort in exactly the same way as the list cache above: a
// browser with IndexedDB unavailable (private mode, storage disabled) loses the offline copy
// and nothing else. A read never throws, and a write never breaks the render that triggered it.
//
// Reads take the viewer's userId and refuse a row belonging to anyone else. That check is the
// real isolation guarantee — clearUserScopedCache() on sign-out is the tidy-up, this is the
// one that holds even if the tidy-up never ran (crash, killed tab, storage error).

async function readScoped<K extends UserScopedStore>(
  store: K,
  eventId: string,
  userId: number,
): Promise<PodiumDB[K]["value"] | null> {
  try {
    const db = await getDb();
    const row = await db.get(store, eventId);
    if (!row || row.userId !== userId) return null;
    return row as PodiumDB[K]["value"];
  } catch {
    return null;
  }
}

async function writeScoped<K extends UserScopedStore>(
  store: K,
  row: PodiumDB[K]["value"],
): Promise<void> {
  try {
    const db = await getDb();
    await db.put(store, row);
  } catch {
    // Best effort — a failed cache write must never break the page that just rendered fine.
  }
}

/** The last GET /events/:eventId this viewer received, or null if they never have. */
export async function getCachedEventDetail(
  eventId: string,
  userId: number,
): Promise<CacheHit<EventDetail> | null> {
  const row = await readScoped("eventDetails", eventId, userId);
  return row ? { value: row.detail, lastSyncedAt: row.lastSyncedAt } : null;
}

export async function putCachedEventDetail(
  eventId: string,
  userId: number,
  detail: EventDetail,
): Promise<void> {
  await writeScoped("eventDetails", {
    id: eventId,
    userId,
    lastSyncedAt: Date.now(),
    detail,
  });
}

/**
 * The last GET /events/:eventId/route this viewer received. The hit itself is what matters,
 * not the route inside it: a hit whose `value` is null means "the server told this viewer
 * this event has no route", which is a different thing from "never fetched" (no hit) and must
 * render as the empty state rather than as a missing cache.
 */
export async function getCachedRoute(
  eventId: string,
  userId: number,
): Promise<CacheHit<EventRoute | null> | null> {
  const row = await readScoped("eventRoutes", eventId, userId);
  return row ? { value: row.route, lastSyncedAt: row.lastSyncedAt } : null;
}

export async function putCachedRoute(
  eventId: string,
  userId: number,
  route: EventRoute | null,
): Promise<void> {
  await writeScoped("eventRoutes", { id: eventId, userId, lastSyncedAt: Date.now(), route });
}

export async function getCachedParticipants(
  eventId: string,
  userId: number,
): Promise<CacheHit<CachedParticipant[]> | null> {
  const row = await readScoped("eventParticipants", eventId, userId);
  return row ? { value: row.participants, lastSyncedAt: row.lastSyncedAt } : null;
}

export async function putCachedParticipants(
  eventId: string,
  userId: number,
  participants: CachedParticipant[],
): Promise<void> {
  await writeScoped("eventParticipants", {
    id: eventId,
    userId,
    lastSyncedAt: Date.now(),
    participants,
  });
}

/**
 * The last live positions actually received. Deliberately kept: reopening the live map with
 * the server down should show where everyone was at the last fix, timestamped, rather than an
 * empty map — every rider marker already carries its own `recordedAt` for the UI to age.
 */
export async function getCachedLiveRiders(
  eventId: string,
  userId: number,
): Promise<CacheHit<{ riders: LiveRider[]; paused: boolean }> | null> {
  const row = await readScoped("eventLive", eventId, userId);
  return row
    ? { value: { riders: row.riders, paused: row.paused }, lastSyncedAt: row.lastSyncedAt }
    : null;
}

export async function putCachedLiveRiders(
  eventId: string,
  userId: number,
  riders: LiveRider[],
  paused: boolean,
): Promise<void> {
  await writeScoped("eventLive", {
    id: eventId,
    userId,
    lastSyncedAt: Date.now(),
    riders,
    paused,
  });
}

/**
 * Sign-out: drop every user-scoped ride cache. Deliberately clears ALL rows, not just the
 * departing rider's — the next person to sign in on this device gets a clean slate either way,
 * and "delete everything" cannot be defeated by a row written with the wrong userId. The
 * per-read userId check above is what protects the data if this never runs.
 *
 * The v1 `events` list cache is NOT touched here: eventsStore.clearMyRides() already clears
 * its "mine" bucket on sign-out, and the "guest" bucket is public data belonging to nobody.
 */
export async function clearUserScopedCache(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(USER_SCOPED_STORES, "readwrite");
    await Promise.all([...USER_SCOPED_STORES.map((name) => tx.objectStore(name).clear()), tx.done]);
  } catch {
    // Best effort — a failed cache clear must never break sign-out.
  }
}

/**
 * Full-logout nuke: empty EVERY object store in podium-db — the v1 `events` list cache
 * (both the "mine" and "guest" buckets) and the four v2 user-scoped ride caches. Clears the
 * contents rather than deleting the database, so the open connection stays valid and there is
 * no `deleteDatabase` "blocked" edge case. Best effort, like everything else here.
 */
export async function clearAllCaches(): Promise<void> {
  try {
    const db = await getDb();
    const names = Array.from(db.objectStoreNames);
    if (names.length === 0) return;
    const tx = db.transaction(names, "readwrite");
    await Promise.all([...names.map((name) => tx.objectStore(name).clear()), tx.done]);
  } catch {
    // IndexedDB unavailable, disabled, or a transaction failure — sign-out proceeds regardless.
  }
}
