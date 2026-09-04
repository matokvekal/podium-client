// Keeps the client's "organizer" UI mode honest against the server.
//
// The Rider / Organizer switch is a client-only preference persisted in localStorage
// (store/userModeStore.ts). Ride creation, though, is gated server-side: an account is
// enabled deliberately (GET /users/me → `canOrganize`). If someone toggled "organizer" while
// it was open — or on another account on the same device — that stale preference would keep
// showing Create buttons that now 403.
//
// This mounts once in AppShell and, the moment a real profile says `canOrganize: false`,
// drops the stored preference back to "rider". It never acts on `undefined` (offline / cached
// v1 profile) — see lib/user-mode.ts `shouldForceRiderMode` for why.

import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { shouldForceRiderMode } from "../lib/user-mode";
import { useUserModeStore } from "../store/userModeStore";

export function useEnforceOrganizerEligibility(): void {
  const canOrganize = useAuth().profile?.canOrganize;
  const mode = useUserModeStore((s) => s.mode);
  const setMode = useUserModeStore((s) => s.setMode);

  useEffect(() => {
    if (mode === "organizer" && shouldForceRiderMode(canOrganize)) {
      setMode("rider");
    }
  }, [canOrganize, mode, setMode]);
}
