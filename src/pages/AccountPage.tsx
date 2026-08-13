/**
 * Account
 *
 * Route:    /account
 * Loads:    nothing — the profile is already in AuthContext
 * Actions:  edit the profile, sign out
 * State:    the edit form
 * Calls:    PATCH /users/me, POST /auth/logout
 *
 * Signing out revokes this session on the server and clears the tokens locally. If the
 * request cannot be made — a rider halfway up a climb with no signal — the local sign-out
 * still happens, and the session dies on its own when the refresh token expires.
 */

import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export function AccountPage() {
  const { profile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <section className="stack">
      <h1>Account</h1>

      <div className="card stack">
        <div>
          <strong>
            {profile?.firstName} {profile?.lastName}
          </strong>
          {profile?.nickname && <span className="muted"> — {profile.nickname}</span>}
        </div>
        <p className="muted">
          Emergency phone: {profile?.emergencyPhone ?? "not set"}. Collected for a future
          emergency feature; not shown to anyone in this version.
        </p>
      </div>

      <button
        className="button button--quiet"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      >
        Sign out
      </button>
    </section>
  );
}
