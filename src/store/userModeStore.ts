// The Rider / Organizer UI mode, persisted client-side. See lib/user-mode.ts for why "rider"
// is the fallback, and why a first run on a server-enabled account starts in Organizer mode
// instead. Same "zustand + persist, default localStorage, podium.* key" pattern as every
// other store here (e.g. store/invitedEventsStore.ts).
//
// This is a UI preference, not an authorization boundary — it decides which controls are
// shown, nothing the server enforces. Switching it takes effect immediately, no re-login.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_USER_MODE, normalizeUserMode, type UserMode } from "../lib/user-mode";

interface UserModeState {
  mode: UserMode;
  /**
   * Has this install ever settled on a mode — either the user flipped the switch, or the
   * first-run default was applied for them? Persisted, because it is what separates "never
   * asked" from "chose rider": without it every cold start would re-apply the organizer
   * default and undo someone switching it off.
   */
  chosen: boolean;
  setMode(mode: UserMode): void;
  /** Apply the first-run Organizer default and persist it. No-op once `chosen` is true, so
   *  it can be called on every render pass; the caller decides eligibility (see
   *  lib/user-mode.ts `shouldDefaultToOrganizer` and app/useEnforceOrganizerEligibility.ts). */
  adoptOrganizerDefault(): void;
}

export const useUserModeStore = create<UserModeState>()(
  persist(
    (set, get) => ({
      mode: DEFAULT_USER_MODE,
      chosen: false,
      setMode(mode) {
        set({ mode: normalizeUserMode(mode), chosen: true });
      },
      adoptOrganizerDefault() {
        // Guarded here rather than inside set(): persist writes storage on every set, and a
        // returning user should not pay a write on each mount just to re-confirm.
        if (get().chosen) return;
        set({ mode: "organizer", chosen: true });
      },
    }),
    {
      name: "podium.userMode",
      partialize: (state) => ({ mode: state.mode, chosen: state.chosen }),
      // An install with no stored key, or a stored value this build doesn't know, resolves to
      // "rider" rather than throwing or showing organizer UI by accident.
      merge: (persisted, current) => {
        const stored = persisted as { mode?: unknown; chosen?: unknown } | undefined;
        return {
          ...current,
          mode: normalizeUserMode(stored?.mode),
          // Installs from before `chosen` existed have a mode but no flag. The key is only
          // ever written by a real choice, so anything already in storage counts as one —
          // otherwise this release would flip every existing rider into Organizer mode.
          chosen: typeof stored?.chosen === "boolean" ? stored.chosen : stored?.mode !== undefined,
        };
      },
    },
  ),
);

/** True when the user is in the full organizer UI — either they asked for it, or the account
 *  was enabled and got it by default on first run. Everything organizer-only is gated on
 *  this; a plain rider never sees create/manage controls. */
export const useIsOrganizer = (): boolean => useUserModeStore((s) => s.mode === "organizer");
