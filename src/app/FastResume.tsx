/**
 * The two halves of Fast Resume that need the router: restoring the route once at launch, and
 * remembering the current one as the rider moves.
 *
 * Renders nothing. It is a component rather than a hook called from App() so that subscribing
 * to the location does not re-render the whole route tree on every navigation — the rule this
 * app already follows everywhere else it watches location.
 *
 * The decision itself is not made here: lib/fast-resume.ts took it at boot, before React
 * rendered, and SplashScreen reads the same snapshot to decide whether to play. See that file
 * for why it must be read exactly once.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fastResumeRoute, recordResumeState } from "../lib/fast-resume";

export function FastResume() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const restored = useRef(false);

  // Restore, once per launch.
  //
  // ⚠ ONLY FROM "/" WITH NOTHING ELSE ON IT. That is the installed app's start_url
  //   (public/manifest.webmanifest) and therefore the one place a launch lands when the rider
  //   asked for nothing in particular. A rider who opened /join/<code>, a /share link or any
  //   bookmark asked for THAT, and moving them off it would break the link they tapped.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const route = fastResumeRoute();
    if (!route || route === "/") return;
    if (location.pathname !== "/" || location.search !== "" || location.hash !== "") return;
    // `replace`, so Back leaves the app instead of returning to a home screen the rider never
    // actually visited.
    navigate(route, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  // Remember where they are. Signed-in only: a signed-out visitor has nothing to resume, and
  // writing their route would leave it on a shared device for whoever signs in next.
  //
  // recordResumeState refuses an unsafe route itself, so /login and the setup detour are never
  // written no matter who navigates there.
  useEffect(() => {
    if (status !== "signed-in") return;
    recordResumeState(`${location.pathname}${location.search}`);
  }, [status, location.pathname, location.search]);

  // Keep `lastActive` honest for a rider who sits on one screen — following a live map for an
  // hour is not "inactive", but it is not a navigation either, so nothing above would have
  // touched the timestamp. One listener on an event the browser already fires; no timer, no
  // polling. `hidden` is the moment worth recording: it is the last thing that happens before
  // the app is backgrounded or closed, and on iOS it is often the ONLY thing that happens.
  useEffect(() => {
    if (status !== "signed-in") return;
    // Reads window.location rather than the router's, deliberately: this listener is registered
    // once and would otherwise close over whichever route was current when it was, and record
    // that one hours later. BrowserRouter keeps the two in step, so this is the same value —
    // just the one that is still true when the event fires.
    function onHidden() {
      if (document.visibilityState !== "hidden") return;
      recordResumeState(`${window.location.pathname}${window.location.search}`);
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [status]);

  return null;
}
