// Likes and hearts on a TRACK, and the optimistic state that makes them feel instant.
//
// WHY A STORE AND NOT CARD STATE. The same track can be on screen twice — the gallery dedupes
// to one row per track, but "My rides" does not, and the picker and the Find Tracks page can
// both be mounted. More importantly the list re-pages as the rider scrolls, and a fresh page
// from the server would otherwise wipe an optimistic like the rider just made. So the truth a
// card renders is: the server's number, then any override this session has recorded, keyed by
// routes.id — which is exactly the key the count itself is shared on.
//
// OPTIMISTIC, AND HONEST ABOUT FAILING. Pressing like paints immediately and rolls back if the
// request fails. It never invents a count: the override only ever holds a number the server
// returned, or the server's own number plus one while the request is in flight.
//
// A LIKE IS ONCE AND PERMANENT (sql/036) — there is no unlike, so `like` is guarded against
// double-sending and the button renders inert afterwards. A HEART IS A TOGGLE: private to the
// rider, nobody counts it, so it goes both ways.

import { create } from "zustand";
import { apiRequest } from "../lib/api-client";

/** What this session knows about one track, over and above what the list payload said. */
interface TrackLikeOverride {
  likes?: number;
  likedByMe?: boolean;
  favoritedByMe?: boolean;
}

interface TrackLikesState {
  /** Keyed by routes.id. Absent = nothing to say; fall back to the list payload. */
  overrides: Record<number, TrackLikeOverride>;
  /** Route ids with a request in flight, so a double-tap cannot double-send. */
  pending: number[];
  like(routeId: number, currentLikes: number | null | undefined): Promise<void>;
  toggleFavorite(routeId: number, currentlyOn: boolean): Promise<void>;
}

function patch(
  state: TrackLikesState,
  routeId: number,
  next: TrackLikeOverride,
): Pick<TrackLikesState, "overrides"> {
  return {
    overrides: { ...state.overrides, [routeId]: { ...state.overrides[routeId], ...next } },
  };
}

export const useTrackLikesStore = create<TrackLikesState>()((set, get) => ({
  overrides: {},
  pending: [],

  async like(routeId, currentLikes) {
    const state = get();
    if (state.pending.includes(routeId)) return;
    if (state.overrides[routeId]?.likedByMe) return;

    const before = state.overrides[routeId];
    // Paint first. `currentLikes ?? 0` is safe here and not a fabricated number: the rider's own
    // like is real, so at minimum the count is 1.
    set((s) => ({
      ...patch(s, routeId, {
        likes: (s.overrides[routeId]?.likes ?? currentLikes ?? 0) + 1,
        likedByMe: true,
      }),
      pending: [...s.pending, routeId],
    }));

    try {
      const result = await apiRequest<{ likes: number; likedByMe: boolean }>(
        `/routes/${routeId}/like`,
        { method: "POST" },
      );
      // The server's count replaces the guess — it knows about everyone else's likes too.
      set((s) => patch(s, routeId, { likes: result.likes, likedByMe: result.likedByMe }));
    } catch {
      // Put it back exactly as it was. A like that did not reach the server must not look like
      // one that did, or the rider believes they have rated a track they have not.
      set((s) => ({
        overrides: { ...s.overrides, [routeId]: { ...before } },
      }));
    } finally {
      set((s) => ({ pending: s.pending.filter((id) => id !== routeId) }));
    }
  },

  async toggleFavorite(routeId, currentlyOn) {
    const state = get();
    if (state.pending.includes(routeId)) return;

    const before = state.overrides[routeId];
    const next = !currentlyOn;
    set((s) => ({
      ...patch(s, routeId, { favoritedByMe: next }),
      pending: [...s.pending, routeId],
    }));

    try {
      const result = await apiRequest<{ favoritedByMe: boolean }>(`/routes/${routeId}/favorite`, {
        method: next ? "POST" : "DELETE",
      });
      set((s) => patch(s, routeId, { favoritedByMe: result.favoritedByMe }));
    } catch {
      set((s) => ({ overrides: { ...s.overrides, [routeId]: { ...before } } }));
    } finally {
      set((s) => ({ pending: s.pending.filter((id) => id !== routeId) }));
    }
  },
}));

/**
 * What a card should actually render: the list payload, with anything this session has learned
 * or optimistically applied laid over the top.
 *
 * Kept as a plain function rather than a hook so a card can call it after subscribing to just
 * the one override it cares about.
 */
export function resolveTrackLikes(
  override: TrackLikeOverride | undefined,
  fromList: { likes?: number | null; likedByMe?: boolean | null; favoritedByMe?: boolean | null },
): { likes: number | null; likedByMe: boolean; favoritedByMe: boolean } {
  return {
    likes: override?.likes ?? fromList.likes ?? null,
    likedByMe: override?.likedByMe ?? fromList.likedByMe ?? false,
    favoritedByMe: override?.favoritedByMe ?? fromList.favoritedByMe ?? false,
  };
}
