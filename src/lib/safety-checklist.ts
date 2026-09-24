// Safety checklist — the pre-ride kit list and a rider's personal ticks.
//
// The ticks are personal preparation state, not ride data: they never go to the server. They
// live in localStorage keyed by USER + RIDE, so
//   - every ride has its own checklist (ticking ride A never touches ride B), and
//   - another account on the same device never inherits someone else's ticks.
// The `elnino.` prefix also puts every key under lib/logout-cleanup.ts, so logging out wipes
// them along with the rest of the user's local data.
//
// Ticks are stored BY STABLE ITEM ID, never by position. If an item is added later it simply
// starts unticked; if one is removed its saved id is ignored on read. Anything unreadable —
// bad JSON, a wrong shape, storage that throws — reads as "nothing ticked" and never throws.

export type SafetyItemId = "helmet" | "lights" | "water" | "tools" | "glasses" | "gloves";

export const SAFETY_ITEM_IDS: readonly SafetyItemId[] = [
  "helmet",
  "lights",
  "water",
  "tools",
  "glasses",
  "gloves",
];

const KNOWN = new Set<string>(SAFETY_ITEM_IDS);

/** v1 is the schema below; bump it (and the key) only if the stored shape itself changes. */
export function safetyChecklistKey(userId: number, rideId: string): string {
  return `elnino.safetyChecklist.v1.${userId}.${rideId}`;
}

/** Stored value: `{"ids":["helmet","water"]}`. */
export function parseSafetyChecks(raw: string | null): Set<SafetyItemId> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids =
      parsed && typeof parsed === "object" && "ids" in parsed
        ? (parsed as { ids: unknown }).ids
        : null;
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((x): x is SafetyItemId => typeof x === "string" && KNOWN.has(x)));
  } catch {
    return new Set();
  }
}

export function readSafetyChecks(userId: number, rideId: string): Set<SafetyItemId> {
  try {
    return parseSafetyChecks(localStorage.getItem(safetyChecklistKey(userId, rideId)));
  } catch {
    return new Set();
  }
}

export function writeSafetyChecks(
  userId: number,
  rideId: string,
  checked: ReadonlySet<SafetyItemId>,
): void {
  try {
    const key = safetyChecklistKey(userId, rideId);
    // Order by the list, not by tick order, so the stored value is stable.
    const ids = SAFETY_ITEM_IDS.filter((id) => checked.has(id));
    if (ids.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ ids }));
  } catch {
    // Private mode / blocked storage — the ticks just won't survive a reload.
  }
}
