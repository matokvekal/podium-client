/**
 * The data behind the track gallery: a paged list of rides, and each one's route geometry
 * fetched only when its card is actually on screen.
 *
 * TWO SEPARATE CONCERNS, deliberately not merged:
 *
 *   1. PAGING THE LIST. GET /events/public has taken limit/offset and returned a real `total`
 *      all along; nothing in the app has ever used it, because apiRequest unwraps the envelope
 *      and drops `total` (hence apiRequestPaged in lib/api-client.ts, added for this).
 *      eventsStore asks for limit=100 once and treats that as "all rides" — fine for a home
 *      screen, useless for a gallery meant to scroll through thousands.
 *
 *   2. GEOMETRY PER CARD. The list payload carries no route: distance and climb on an event
 *      are the organizer's own typed numbers, not the track's. The line itself is one call per
 *      ride (GET /events/:id/route), so it is fetched lazily as cards come into view and
 *      cached in a module-level Map that outlives the modal. Open the gallery, scroll, close
 *      it, open it again — the routes already looked at are still there.
 *
 * "MY RIDES" IS NOT A FILTER on the public endpoint. It is GET /events?filter=mine merged with
 * ?filter=joined, which eventsStore already loads, dedupes and caches to IndexedDB. This hook
 * reads that store rather than growing a second, worse copy of it; the search box filters it
 * in memory, since it is one page by definition.
 *
 * RIDES WITHOUT A TRACK. The list endpoint cannot filter on "has a route", so some rides come
 * back with nothing to draw. They are dropped from the grid once their fetch resolves null,
 * and the caller keeps loading pages so the grid still fills. Never a fabricated line, never a
 * card that pretends — the rule stated in CopyTrackSheet and EventCreatePage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, apiRequestPaged } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";
import type { EventSummary } from "../lib/local-db";
import { useEventsStore } from "../store/eventsStore";

/** One network page. Smaller than the server's max of 100 — this fills about two screens of
 * grid, and every row costs a follow-up geometry call, so a huge page just queues work the
 * rider may never scroll to. */
const PAGE_SIZE = 24;

export type GallerySource = "all" | "mine";

/**
 * Geometry cache, keyed by event id, shared by every gallery instance for the life of the tab.
 * `null` is a real cached answer meaning "this ride has no route" — distinct from a missing
 * key, which means "not asked yet". Storing the negative is what stops a routeless ride being
 * re-requested every time it scrolls past.
 */
const routeCache = new Map<string, GalleryRoute | null>();
const inFlight = new Set<string>();

/**
 * The geometry response, plus the reuse count when the server reports one.
 *
 * `usedByRides` is how many rides have been built on this track — the honest version of a
 * "downloads" number, since nothing in this product downloads a track file. It rides along on
 * the `?preview=1` response the gallery already makes rather than costing a second call per
 * card. A server that has not shipped it yet simply omits it, and the card drops the stat.
 */
export type GalleryRoute = EventRoute & { usedByRides?: number };

/** A ride whose route came back missing or too short to draw. */
function isRouteless(route: GalleryRoute | null | undefined): boolean {
  return route === null || (route != null && route.points.length < 2);
}

interface UseTrackGalleryResult {
  rides: EventSummary[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Called by a card when it scrolls into view; resolves and caches that ride's route. */
  requestRoute: (eventId: string) => void;
  /** Resolved geometry by event id. `undefined` = not asked yet, `null` = asked, none exists. */
  routes: ReadonlyMap<string, GalleryRoute | null>;
}

export function useTrackGallery(source: GallerySource, search: string): UseTrackGalleryResult {
  const { status } = useAuth();
  const myRides = useEventsStore((s) => s.myRides);
  const myRidesLoading = useEventsStore((s) => s.myRidesLoading);
  const loadMyRides = useEventsStore((s) => s.loadMyRides);

  // The search box talks to the server, so it is debounced rather than fired per keystroke:
  // `fetchPage` closes over the query, so typing "galilee" without this is seven requests, six
  // of them already stale by the time they land.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [publicRides, setPublicRides] = useState<EventSummary[]>([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicLoading, setPublicLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Resolved geometry, mirrored out of the module cache into state so React actually re-renders
   * when an answer lands — the cache alone is a mutable Map and nothing would notice it change.
   * Seeded FROM the cache, so reopening the gallery paints the routes already known instead of
   * re-fetching them and flashing placeholders.
   */
  const [routes, setRoutes] = useState<ReadonlyMap<string, GalleryRoute | null>>(
    () => new Map(routeCache),
  );

  // Guards every async write: a filter change while a page is in flight must not append that
  // page to the new list. Same one-request-wins pattern as tracksStore and eventsStore.
  const requestIdRef = useRef(0);
  const offsetRef = useRef(0);
  // Read inside requestRoute so that callback can stay identity-stable — the cards' observers
  // depend on it, and a new identity every time the toggle moves would rebuild all of them.
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Loaded ONLY when the rider actually asks for their own rides, not on open.
  //
  // This is authenticated, and the gallery is the one screen that fires a burst of requests the
  // moment it opens — two here plus one per visible card. If the 15-minute access token has
  // expired while the organizer was filling in the form, that burst is a wall of 401s, and a
  // refused refresh ends in SESSION_EXPIRED, which AuthContext handles with a hard
  // window.location.replace("/login"). The document blanks mid-navigation: the gallery paints,
  // then the screen goes white. Nothing needs My Rides until the toggle is pressed, so it is
  // not fetched until then.
  useEffect(() => {
    if (source !== "mine") return;
    loadMyRides(status === "signed-in");
  }, [source, status, loadMyRides]);

  const fetchPage = useCallback(
    async (offset: number, thisRequest: number) => {
      // NO `bucket` FILTER, on purpose. Every other list in this app asks for "upcoming",
      // because a rider browsing rides wants one they can still join. This is a catalogue of
      // TRACKS, and a track from a ride that finished last spring is exactly as rideable as one
      // from next Saturday — filtering to upcoming would hide the richest source of them.
      // Omitting the parameter is a real "no filter" server-side ($5 IS NULL), not a default.
      //
      // sort=newest is created_at DESC: most recently added track first, and a stable key to
      // page against, so a ride cannot shuffle between pages while the rider scrolls.
      const params = new URLSearchParams({
        sort: "newest",
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());

      const page = await apiRequestPaged<EventSummary>(`/events/public?${params.toString()}`, {
        anonymous: true,
      });
      if (thisRequest !== requestIdRef.current) return;

      setPublicTotal(page.total);
      offsetRef.current = offset + page.data.length;
      setPublicRides((prev) => {
        if (offset === 0) return page.data;
        // Defensive: an event that shifted page between requests must not render twice and
        // hand React two children with the same key.
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...page.data.filter((e) => !seen.has(e.id))];
      });
    },
    [debouncedSearch],
  );

  // First page, and a fresh one whenever the search text changes. Only the public list pages;
  // "mine" comes from the store above.
  useEffect(() => {
    if (source !== "all") return;
    const thisRequest = ++requestIdRef.current;
    offsetRef.current = 0;
    setPublicLoading(true);
    setError(null);
    (async () => {
      try {
        await fetchPage(0, thisRequest);
      } catch {
        if (thisRequest !== requestIdRef.current) return;
        // The list is not cleared: a failed refresh is not evidence that there are no rides.
        setError("Could not load tracks right now.");
      } finally {
        if (thisRequest === requestIdRef.current) setPublicLoading(false);
      }
    })();
  }, [fetchPage, source]);

  const loadMore = useCallback(() => {
    if (source !== "all" || publicLoading || loadingMore) return;
    if (offsetRef.current >= publicTotal) return;
    const thisRequest = requestIdRef.current;
    setLoadingMore(true);
    (async () => {
      try {
        await fetchPage(offsetRef.current, thisRequest);
      } catch {
        if (thisRequest !== requestIdRef.current) return;
        setError("Could not load more tracks right now.");
      } finally {
        if (thisRequest === requestIdRef.current) setLoadingMore(false);
      }
    })();
  }, [fetchPage, source, publicLoading, loadingMore, publicTotal]);

  const requestRoute = useCallback((eventId: string) => {
    if (routeCache.has(eventId) || inFlight.has(eventId)) return;
    inFlight.add(eventId);
    (async () => {
      try {
        // `preview=1` asks for the gallery's shape: a thinned line plus the reuse count. A
        // server that does not know the parameter ignores it and answers with the ordinary
        // full-geometry body, which is a perfectly good answer — the thumbnail thins whatever
        // it is given and the card drops the count. So this is safe to ship ahead of the
        // server, and gets better the moment the server catches up.
        // ANONYMOUS FOR THE PUBLIC LIST. The server serves a public ride's route without a
        // token — verified against production — so sending the bearer token bought nothing and
        // made every card one more 401 in the burst described above, which is what could take
        // the whole session down. My Rides is the exception: it can contain a PRIVATE ride,
        // whose route is only readable as its owner, so those stay authenticated.
        const route = await apiRequest<GalleryRoute | null>(`/events/${eventId}/route?preview=1`, {
          anonymous: sourceRef.current === "all",
        });
        routeCache.set(eventId, route ?? null);
        setRoutes((prev) => new Map(prev).set(eventId, route ?? null));
      } catch {
        // A failed fetch is NOT "this ride has no track" — leaving it uncached lets it retry
        // the next time the card scrolls into view, rather than hiding a ride over one blip.
      } finally {
        inFlight.delete(eventId);
      }
    })();
  }, []);

  const searchQ = search.trim().toLowerCase();

  const rides = useMemo(() => {
    const base =
      source === "mine"
        ? searchQ
          ? myRides.filter(
              (e) =>
                e.name.toLowerCase().includes(searchQ) ||
                (e.location ?? "").toLowerCase().includes(searchQ),
            )
          : myRides
        : publicRides;
    // Hidden only once the answer is known. A ride still being fetched stays in the grid
    // showing its placeholder, so cards do not flicker in and out while scrolling. A ride
    // already proven routeless in an earlier opening of the modal is filtered on first paint,
    // because `routes` is seeded from the cache that outlives this component.
    return base.filter((e) => !isRouteless(routes.get(e.id)));
  }, [source, myRides, publicRides, searchQ, routes]);

  const loading = source === "mine" ? myRidesLoading && myRides.length === 0 : publicLoading;
  const total = source === "mine" ? rides.length : publicTotal;
  const hasMore = source === "all" && offsetRef.current < publicTotal;

  return {
    rides,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    requestRoute,
    routes,
  };
}
