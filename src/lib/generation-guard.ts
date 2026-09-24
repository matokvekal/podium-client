// A tiny "is this async result still relevant" guard.
//
// The problem it solves: an async fetch starts, the user moves on to something else before it
// resolves, and the fetch's `.then()` then unconditionally applies its (now stale) result on top
// of the user's newer choice — silently. `AbortController` stops the REQUEST but a fetch that
// already left the network still runs its `.then()`; this stops the RESULT from being applied
// once it's no longer the latest thing asked for. See EventCreatePage.tsx's track-selection
// races (upload vs. copy-from-ride vs. the Find Tracks deep link, all able to interleave) for the
// motivating bug: an old track's geometry landing on top of a freshly uploaded one.
//
// Not React-specific — wrap one in a ref (or a module-level `let`) to survive across renders.

export interface GenerationGuard {
  /** Call the moment a new async operation starts. Returns a token to check its result against. */
  next(): number;
  /** True if `token` is still the most recently started one — false if something newer began. */
  isCurrent(token: number): boolean;
}

export function createGenerationGuard(): GenerationGuard {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (token) => token === current,
  };
}
