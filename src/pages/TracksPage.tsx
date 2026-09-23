/**
 * Find Tracks — the public track library.
 *
 * Route:  /findtracks[/<country>[/<type>]]   e.g. /findtracks/il/mtb   (was /routes — see App.tsx)
 * Open to everyone, signed in or not, like every other browse surface in this app. The address
 * is the shareable link: it names the country and discipline, opening it applies them, and
 * changing either filter rewrites it (lib/find-tracks-url.ts). Facebook's card for each link is
 * a static file the build writes (vite-plugin-findtracks-og.ts).
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

import { useEffect, useMemo } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { TrackGalleryBrowser } from "../app/TrackGalleryBrowser";
import {
  buildFindTracksPath,
  type FindTracksFacets,
  findTracksTitle,
  parseFindTracksPath,
} from "../lib/find-tracks-url";
import type { EventSummary } from "../lib/local-db";
import { trackHandoffState } from "../lib/track-handoff";

export function TracksPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const splat = useParams()["*"];
  const parsed = useMemo(() => parseFindTracksPath(splat), [splat]);

  // The tab title follows the link, so a bookmark or a browser history entry reads
  // "MTB tracks in Israel" rather than the site name.
  useEffect(() => {
    const previous = document.title;
    document.title = findTracksTitle(parsed.facets);
    return () => {
      document.title = previous;
    };
  }, [parsed.facets]);

  // An unknown segment, upper case or a trailing slash all land on the one canonical spelling,
  // so there is exactly one URL per view (and one preview file for it).
  const isCanonical = parsed.valid && pathname.replace(/\/+$/, "") === parsed.canonicalPath;
  if (!isCanonical) return <Navigate to={parsed.canonicalPath} replace />;

  function changeFacets(facets: FindTracksFacets) {
    const next = buildFindTracksPath(facets);
    if (next !== parsed.canonicalPath) navigate(next, { replace: true });
  }

  /**
   * The page's cards hand over through a <Link> of their own (TrackGalleryCard's "page"
   * variant), which is what lets a rider open the new ride in a new tab. This is the same
   * destination for anything that reaches the callback instead — a keyboard activation path, or
   * a future card that is a button rather than a link — so the two can never disagree.
   */
  function openCreateWithTrack(event: EventSummary) {
    if (event.routeId == null) return;
    navigate("/events/new", { state: trackHandoffState(event) });
  }

  return (
    <section className="stack">
      <TrackGalleryBrowser
        variant="page"
        onPick={openCreateWithTrack}
        urlSync={{ facets: parsed.facets, onChange: changeFacets }}
      />
    </section>
  );
}
