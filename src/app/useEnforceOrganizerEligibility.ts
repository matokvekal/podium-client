// Keeps the client's "organizer" UI mode honest against the server, in both directions.
//
// The Rider / Organizer switch is a client-only preference persisted in localStorage
// (store/userModeStore.ts). Ride creation, though, is gated server-side: an account is
// enabled deliberately (GET /users/me → `canOrganize`).
//
// Down: if someone toggled "organizer" while it was open — or on another account on the same
// device — that stale preference would keep showing Create buttons that now 403, so a real
// profile saying `canOrganize: false` drops it back to "rider".
//
// Up: an account the server HAS enabled, on an install that has never picked a side, starts
// in Organizer mode with the menu switch already checked. That is written to localStorage
// like any other choice, so it holds for next time — including a cold start that has no
// profile yet — and an explicit "rider" is never overwritten by it.
//
// Neither direction acts on `undefined` (offline / cached v1 profile) — see lib/user-mode.ts
// `shouldForceRiderMode` and `shouldDefaultToOrganizer` for why.
//
// Mounts once in AppShell.

import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { shouldDefaultToOrganizer, shouldForceRiderMode } from "../lib/user-mode";
import { useUserModeStore } from "../store/userModeStore";

export function useEnforceOrganizerEligibility(): void {
  const canOrganize = useAuth().profile?.canOrganize;
  const mode = useUserModeStore((s) => s.mode);
  const chosen = useUserModeStore((s) => s.chosen);
  const setMode = useUserModeStore((s) => s.setMode);
  const adoptOrganizerDefault = useUserModeStore((s) => s.adoptOrganizerDefault);

  useEffect(() => {
    if (shouldDefaultToOrganizer(canOrganize, chosen)) {
      adoptOrganizerDefault();
      return;
    }
    if (mode === "organizer" && shouldForceRiderMode(canOrganize)) {
      setMode("rider");
    }
  }, [adoptOrganizerDefault, canOrganize, chosen, mode, setMode]);
}
