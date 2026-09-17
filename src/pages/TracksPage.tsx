/**
 * Find Tracks — the public track library.
 *
 * Route:  /routes
 * Open to everyone, signed in or not, like every other browse surface in this app.
 *
 * WHAT CHANGED AND WHY. This page used to be a route PLANNER: a big overview map, mock hazard /
 * POI / air-quality layers, and a results list fed by GET /routes/public — the standalone
 * `routes` library. Two things were wrong with it. It was wrapped in RequireOrganizer, so a
 * rider in Rider mode could not open it at all, which is the opposite of what a public library
 * is for. And the library table it read carries no country, no region and no difficulty, while
 * in practice almost every real track in this app reaches the world attached to a ride.
 *
 * Meanwhile the create form had the good version hidden inside it: a full browser over
 * /events/public with live maps, server-backed filters and paging, reachable only by starting
 * to create a ride. So the page kept its URL, its name and its place in the drawer, and its
 * body is now that browser (TrackGalleryBrowser) — the same one the picker uses, so the two can
 * never drift apart.
 *
 * The mock hazard / POI / air-quality layers are gone rather than reimplemented: no data
 * provider was ever chosen for any of them, and a map of invented hazards is worse than no map.
 * store/tracksStore.ts and GET /routes/public are untouched and still work; nothing else in the
 * app read this page.
 */

import { useNavigate } from "react-router-dom";
import { TrackGalleryBrowser } from "../app/TrackGalleryBrowser";
import type { EventSummary } from "../lib/local-db";

export function TracksPage() {
  const navigate = useNavigate();

  /**
   * The page's cards hand over through a <Link> of their own (TrackGalleryCard's "page"
   * variant), which is what lets a rider open the new ride in a new tab. This is the same
   * destination for anything that reaches the callback instead — a keyboard activation path, or
   * a future card that is a button rather than a link — so the two can never disagree.
   */
  function openCreateWithTrack(event: EventSummary) {
    if (event.routeId == null) return;
    navigate("/events/new", {
      state: {
        fromRouteId: event.routeId,
        fromRouteName: event.name,
        fromRoutePlace: event.location ?? event.area ?? null,
        fromRouteDistanceKm: event.distanceKm ?? null,
        fromRouteClimbM: event.elevationGain ?? null,
        fromRouteSurface: event.activityType ?? null,
      },
    });
  }

  return (
    <section className="stack">
      <TrackGalleryBrowser variant="page" onPick={openCreateWithTrack} />
    </section>
  );
}
