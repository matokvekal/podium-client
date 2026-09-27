/**
 * Site-traffic beacon: fires one best-effort PAGE_VIEW on every real SPA route change, so
 * /admin2026 can show daily visits (see server's src/adminAnalytics for the read side).
 *
 * Modeled on FastResume.tsx's shape: a component rather than a hook, rendered as a sibling of
 * <Routes> in App(), so watching the location does not re-render the whole route tree.
 *
 * Deliberately excludes /admin2026 (the dashboard reading these numbers should not inflate
 * them) and never retries — a failed beacon is simply a page view nobody will ever know about,
 * exactly like the "best effort, never blocks the UI" idiom used everywhere else in this app
 * (see AuthContext.tsx's `.catch(() => undefined)` on /auth/logout).
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { apiRequest } from "../lib/api-client";
import { getOrCreateSessionId, getVisitorId } from "../lib/visitor";

const EXCLUDED_PREFIXES = ["/admin2026"];

export function PageViewTracker() {
  const location = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (location.pathname === lastTrackedPath.current) return;
    lastTrackedPath.current = location.pathname;

    if (EXCLUDED_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))) return;

    void apiRequest("/analytics/page-view", {
      method: "POST",
      body: {
        path: location.pathname,
        visitorId: getVisitorId(),
        sessionId: getOrCreateSessionId(),
        referrer: document.referrer || null,
      },
    }).catch(() => undefined);
  }, [location.pathname]);

  return null;
}
