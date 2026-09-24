// The rider's own "did I bring it" ticks for the pre-ride safety checklist (app/SafetySheet.tsx).
//
// PER RIDE, PER DEVICE, in localStorage — a personal reminder, not ride data: nothing is sent to
// the server or stored in the database. The key starts with `elnino.` on purpose:
// lib/logout-cleanup.ts wipes every `elnino.*` key on sign-out, so one rider's ticks never show
// up for the next person on a shared phone.
//
// Every access is guarded. Storage can be missing, full, or throw (private mode); a checklist
// that cannot be read or written is simply all-unticked / not kept, never an error.

/** The six checklist items, in the order the sheet lists them. The ids are what gets stored. */
export const SAFETY_ITEM_IDS = [
  "helmet",
  "lights",
  "water",
  "puncture",
  "sunglasses",
  "gloves",
] as const;

export type SafetyItemId = (typeof SAFETY_ITEM_IDS)[number];

export const SAFETY_CACHE_PREFIX = "elnino.safety.";

/** The slice of Storage this needs, so tests can pass a plain in-memory object. */
export type SafetyStorage = Pick<Storage, "getItem" | "setItem">;

export function safetyKey(eventId: string): string {
  return `${SAFETY_CACHE_PREFIX}${eventId}`;
}

function defaultStorage(): SafetyStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isItemId(value: unknown): value is SafetyItemId {
  return typeof value === "string" && (SAFETY_ITEM_IDS as readonly string[]).includes(value);
}

/** The ticked items for this ride. Anything unreadable, or an id we do not know, is dropped. */
export function readSafetyChecks(
  eventId: string,
  storage: SafetyStorage | null = defaultStorage(),
): SafetyItemId[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(safetyKey(eventId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return SAFETY_ITEM_IDS.filter((id) => parsed.some((value) => isItemId(value) && value === id));
  } catch {
    return [];
  }
}

export function writeSafetyChecks(
  eventId: string,
  checked: readonly SafetyItemId[],
  storage: SafetyStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(safetyKey(eventId), JSON.stringify(checked));
  } catch {
    // Quota or disabled storage: the ticks still work this session, they just are not kept.
  }
}

/** Green only when EVERY item is ticked. */
export function isSafetyComplete(checked: readonly SafetyItemId[]): boolean {
  return SAFETY_ITEM_IDS.every((id) => checked.includes(id));
}
