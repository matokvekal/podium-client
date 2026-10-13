/**
 * The sign-in gate for the studio's own screens: the same checks the app's RequireAuth makes
 * (signed in, profile complete), but WITHOUT the app shell around them.
 *
 * Ride Studio is a focused, full-screen conversation with a header of its own. Inside the shell
 * it would carry two headers and two Back controls (the shell's arrow also fires for any
 * /events/<word> path), which is exactly the clutter the studio exists to remove. The live ride
 * map uses the same idea (App.tsx's OpenFullBleed); this one still requires a signed-in user.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function StudioGate({ children }: { children: ReactNode }) {
  const { status, requiresProfile } = useAuth();
  const location = useLocation();

  if (status === "loading") return <p className="muted">Loading…</p>;
  if (status === "signed-out") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (requiresProfile) {
    return <Navigate to="/account/setup" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
