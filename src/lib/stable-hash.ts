/**
 * One string hash, shared by everything that picks a deterministic visual.
 *
 * It exists as its own module because two different subsystems pick "the same thing every
 * time" from a seed — app/event-visuals.ts (an event's placeholder colour and its built-in
 * cover) and lib/identity-presets.ts (a user's default cover). If each kept its own copy and
 * one was ever "improved", every existing user's default would silently change to a different
 * picture. Same function, one place, no drift.
 *
 * Not a cryptographic hash and not stable across a value change: it is `imul`-31 over the
 * UTF-16 code units, which is enough to spread ids evenly across a small pool.
 */
export function stableHash(seed: string | null | undefined): number {
  const s = seed ?? "";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Deterministic pick from a fixed list. Empty list → null, never a throw. */
export function pickStable<T>(items: readonly T[], seed: string | null | undefined): T | null {
  if (items.length === 0) return null;
  return items[stableHash(seed) % items.length] ?? null;
}
