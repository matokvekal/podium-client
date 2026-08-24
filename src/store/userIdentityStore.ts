/**
 * The signed-in rider's avatar/cover pick, held on THIS DEVICE ONLY.
 *
 * ── This is explicitly temporary, and never pretends otherwise ─────────────────────────────
 *
 * There is no server field for a user's avatar/cover yet and no upload endpoint. Rather than
 * fake a successful save, a pick is persisted here and the account page says plainly that it
 * lives on this device until the server can hold it. Nothing here is ever presented as synced,
 * and no request is attempted (see serverSupportsVisualIdentity in lib/user-identity.ts).
 *
 * When the server does start carrying these fields, reconcileWithServer() drops the local copy
 * for whichever asset the server now answers for — server data becomes the source of truth and
 * the temporary value is cleared, not merged. The resolvers already rank server above local, so
 * that reconciliation is a cleanup, not a behaviour change.
 *
 * ── Scoping ────────────────────────────────────────────────────────────────────────────────
 *
 * Keyed by user id, the same discipline lib/local-db.ts applies to its caches: on a shared
 * device, one rider's identity must never be shown to whoever signs in next. AuthContext's
 * signOut() calls forgetUserIdentity() for the departing rider.
 *
 * Only the processed, compressed representation is stored (a data URL of at most ~100 KB — see
 * lib/image-processing.ts), never the original file. localStorage is a small budget shared with
 * every other podium.* store, so writes are size-capped and a refusal is surfaced rather than
 * left to throw inside setItem and corrupt the whole store.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LocalVisualIdentity,
  LocalVisualSelection,
  UserVisualIdentity,
} from "../lib/user-identity";

/**
 * Hard ceiling per stored asset. Above the 100 KB cover target with room for base64's ~33%
 * overhead, and far below the ~5 MB localStorage origin budget shared with every other store.
 */
const MAX_STORED_DATA_URL_BYTES = 180 * 1024;

const EMPTY: LocalVisualIdentity = { avatar: null, cover: null };

export type IdentitySlot = "avatar" | "cover";

interface UserIdentityState {
  byUser: Record<string, LocalVisualIdentity>;
  /** Picks a built-in preset. Clears any upload in that slot — one choice per slot. */
  selectPreset(userId: number | string, slot: IdentitySlot, presetId: string): void;
  /** Stores a processed upload. Throws if it is over MAX_STORED_DATA_URL_BYTES. */
  setUpload(userId: number | string, slot: IdentitySlot, dataUrl: string): void;
  /** Back to no explicit choice — the resolvers fall through to the automatic rungs. */
  clearSlot(userId: number | string, slot: IdentitySlot): void;
  /** Drops everything for one rider. Called on sign-out. */
  forgetUser(userId: number | string): void;
  /**
   * Once the server answers for an asset, the temporary local copy for it is redundant and is
   * dropped. Safe to call on every profile load: a no-op while the server has nothing.
   */
  reconcileWithServer(userId: number | string, server: UserVisualIdentity | null | undefined): void;
}

const key = (userId: number | string) => String(userId);

function writeSlot(
  state: UserIdentityState,
  userId: number | string,
  slot: IdentitySlot,
  value: LocalVisualSelection | null,
): Pick<UserIdentityState, "byUser"> {
  const id = key(userId);
  return {
    byUser: { ...state.byUser, [id]: { ...(state.byUser[id] ?? EMPTY), [slot]: value } },
  };
}

export const useUserIdentityStore = create<UserIdentityState>()(
  persist(
    (set) => ({
      byUser: {},

      selectPreset(userId, slot, presetId) {
        set((state) =>
          writeSlot(state, userId, slot, {
            presetId,
            uploadDataUrl: null,
            updatedAt: Date.now(),
          }),
        );
      },

      setUpload(userId, slot, dataUrl) {
        if (dataUrl.length > MAX_STORED_DATA_URL_BYTES) {
          throw new Error(
            "That image is too large to keep on this device. Try a smaller picture.",
          );
        }
        set((state) =>
          writeSlot(state, userId, slot, {
            presetId: null,
            uploadDataUrl: dataUrl,
            updatedAt: Date.now(),
          }),
        );
      },

      clearSlot(userId, slot) {
        set((state) => writeSlot(state, userId, slot, null));
      },

      forgetUser(userId) {
        set((state) => {
          const { [key(userId)]: _dropped, ...rest } = state.byUser;
          return { byUser: rest };
        });
      },

      reconcileWithServer(userId, server) {
        set((state) => {
          const id = key(userId);
          const local = state.byUser[id];
          if (!local) return state;

          const serverHas = (asset: UserVisualIdentity[IdentitySlot]) =>
            !!(asset?.url || asset?.presetId);

          const next: LocalVisualIdentity = {
            avatar: serverHas(server?.avatar) ? null : local.avatar,
            cover: serverHas(server?.cover) ? null : local.cover,
          };
          if (next.avatar === local.avatar && next.cover === local.cover) return state;

          // Nothing left to keep for this rider — drop the row rather than leave `{null,null}`.
          if (!next.avatar && !next.cover) {
            const { [id]: _empty, ...rest } = state.byUser;
            return { byUser: rest };
          }
          return { byUser: { ...state.byUser, [id]: next } };
        });
      },
    }),
    {
      name: "podium.userIdentity",
      version: 1,
      // Version 1 is the first shape there has ever been. Anything claiming to be older is not
      // something this build wrote, so it is discarded rather than guessed at — a corrupted
      // entry must not be able to put a broken data URL in front of a rider.
      migrate: (persisted, version) => {
        if (version < 1) return { byUser: {} };
        return persisted as { byUser: Record<string, LocalVisualIdentity> };
      },
      partialize: (state) => ({ byUser: state.byUser }),
    },
  ),
);

/** Read helper — always returns a usable object, never undefined. */
export function getLocalIdentity(
  byUser: Record<string, LocalVisualIdentity>,
  userId: number | string | null | undefined,
): LocalVisualIdentity {
  if (userId == null) return EMPTY;
  return byUser[key(userId)] ?? EMPTY;
}

/** Imperative access for non-React callers (AuthContext's sign-out and profile load). */
export function forgetUserIdentity(userId: number | string): void {
  useUserIdentityStore.getState().forgetUser(userId);
}

export function reconcileUserIdentity(
  userId: number | string,
  server: UserVisualIdentity | null | undefined,
): void {
  useUserIdentityStore.getState().reconcileWithServer(userId, server);
}
