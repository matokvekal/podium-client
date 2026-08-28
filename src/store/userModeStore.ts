// The Rider / Organizer UI mode, persisted client-side. See lib/user-mode.ts for why "rider"
// is the default and the fallback. Same "zustand + persist, default localStorage, podium.*
// key" pattern as every other store here (e.g. store/invitedEventsStore.ts).
//
// This is a UI preference, not an authorization boundary — it decides which controls are
// shown, nothing the server enforces. Switching it takes effect immediately, no re-login.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_USER_MODE, normalizeUserMode, type UserMode } from "../lib/user-mode";

interface UserModeState {
  mode: UserMode;
  setMode(mode: UserMode): void;
}

export const useUserModeStore = create<UserModeState>()(
  persist(
    (set) => ({
      mode: DEFAULT_USER_MODE,
      setMode(mode) {
        set({ mode: normalizeUserMode(mode) });
      },
    }),
    {
      name: "podium.userMode",
      partialize: (state) => ({ mode: state.mode }),
      // An install with no stored key, or a stored value this build doesn't know, resolves to
      // "rider" rather than throwing or showing organizer UI by accident.
      merge: (persisted, current) => ({
        ...current,
        mode: normalizeUserMode((persisted as { mode?: unknown } | undefined)?.mode),
      }),
    },
  ),
);

/** True when the user has opted into the full organizer UI. Everything organizer-only is
 *  gated on this; a plain rider (the default) never sees create/manage controls. */
export const useIsOrganizer = (): boolean => useUserModeStore((s) => s.mode === "organizer");
