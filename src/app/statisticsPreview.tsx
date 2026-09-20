/**
 * Rider Statistics PREVIEW GATE — one place that says who may see the preview-only Statistics
 * screens (My Statistics at /stats, the National Leaderboard at /stats/leaderboard).
 *
 * Achievements (/stats/achievements) is NOT behind this: it is open to every signed-in rider.
 *
 * The answer comes from the server (GET /users/me -> canSeeStatistics, driven by
 * STATISTICS_PREVIEW_EMAILS in user.controller.ts). Only an explicit `true` counts, the same rule
 * the drawer always used; an absent field (cached older profile) is a "no", not a guess.
 *
 * CLIENT-SIDE ONLY, like the menu gate it replaces: it decides what a rider is shown and where a
 * typed URL lands. The /statistics/* API itself is unchanged and still only requires sign-in.
 * Delete this file (and its three call sites) when Statistics opens up for everyone.
 */

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function useCanSeeStatisticsPreview(): boolean {
  return useAuth().profile?.canSeeStatistics === true;
}

/**
 * Wraps a preview-only Statistics route. Sits INSIDE RequireAuth (App.tsx), so the profile has
 * already loaded by the time this renders; anyone not on the preview list is sent home, the same
 * landing RequireOrganizer uses for a stale bookmark.
 */
export function RequireStatisticsPreview({ children }: { children: ReactNode }) {
  if (!useCanSeeStatisticsPreview()) return <Navigate to="/" replace />;
  return <>{children}</>;
}
