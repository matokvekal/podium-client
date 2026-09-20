/**
 * The data behind the track gallery: a paged list of rides.
 *
 * TWO SEPARATE CONCERNS, deliberately not merged:
 *
 *   1. PAGING THE LIST. GET /events/public has taken limit/offset and returned a real `total`
 *      all along; nothing in the app had used it, because apiRequest unwraps the envelope and
 *      drops `total` (hence apiRequestPaged in lib/api-client.ts, added for this). eventsStore
 *      asks for limit=100 once and treats that as "all rides" — fine for a home screen, useless
 *      for a gallery meant to scroll through thousands.
 *
 *   2. GEOMETRY. There is none to fetch here. Every row carries `preview` — a 60-point line and
 *      its elevations (server: routes.thumb_points, sql/046) — so a card draws itself from the
 *      row. This hook used to make one GET /events/:id/route per card as it scrolled into view;
 *      the API rate-limits at 300 requests per 15 minutes, so about twelve pages of scrolling
 *      used it all up, after which every map spun and the list itself failed with "Could not
 *      load tracks right now". Scrolling is now one request per page. The detailed line is
 *      fetched only when a rider explores a card's map (track-detail.ts), and the original GPX
 *      only on an explicit download.
 *
 * "MY RIDES" IS NOT A FILTER on the public endpoint. It is GET /events?filter=mine merged with
 * ?filter=joined, which eventsStore already loads, dedupes and caches to IndexedDB. This hook
 * reads that store rather than growing a second, worse copy of it; the search box filters it
 * in memory, since it is one page by definition. GET /events rows carry no `preview`, so those
 * cards draw no route line for now (and make no per-card fetch either).
 *
 * RIDES WITHOUT A TRACK. The list endpoint cannot filter on "has a route", so some rides come
 * back with nothing to draw. They are dropped from the grid and the caller keeps loading pages
 * so the grid still fills. Never a fabricated line, never a card that pretends — the rule stated
 * in CopyTrackSheet and EventCreatePage. "No track" is decided by `routeId`, not by the preview:
 * a ride whose route exists but whose preview the server could not build (a database that has
 * not run sql/046 yet) still shows, just without a line.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequestPaged } from "../lib/api-client";
import type { EventSummary } from "../lib/local-db";
import {
  applyTrackGalleryCriteria,
  buildTrackGalleryQuery,
  type TrackGalleryCriteria,
  type TrackGallerySort,
} from "../lib/track-gallery-filter";
import { useEventsStore } from "../store/eventsStore";

/** One network page. Smaller than the server's max of 100 — this fills about two screens of
 * grid, and every row carries its preview line, so a huge page is bytes the rider may never
 * scroll to. */
const PAGE_SIZE = 24;

export type GallerySource = "all" | "mine";

/** Cooldown when a 429 names no wait of its own. */
const DEFAULT_RATE_LIMIT_WAIT_S = 60;
/** The API's rate-limit window is 15 minutes; a longer wait than that is a bad header. */
const MAX_RATE_LIMIT_WAIT_S = 15 * 60;

/**
 * Why the next page is not being fetched on its own. While this is set the list is NOT asking for
 * more — the scroll sentinel is not even mounted — so a failed page cannot re-arm itself.
 *
 *   "rate-limited"  the API answered 429. `retryInSeconds` is the wait it asked for; one automatic
 *                   retry follows after it, and nothing further without the rider's say-so.
 *   "failed"        any other failure. Never retried automatically: only the rider's "Try again".
 */
export interface LoadMoreProblem {
  kind: "rate-limited" | "failed";
  /** Seconds until the one automatic retry, or null when none is pending. */
  retryInSeconds: number | null;
}

/** A ride with no track at all. Decided by `routeId`, which the list has always carried. */
function hasNoTrack(ride: EventSummary): boolean {
  return ride.routeId === null;
}

interface UseTrackGalleryResult {
  rides: EventSummary[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Set after a failed page; see LoadMoreProblem. Loaded cards stay usable while it is. */
  loadMoreProblem: LoadMoreProblem | null;
  /** The rider's explicit "Try again": refetches the page that failed, once. */
  retry: () => void;
}

export function useTrackGallery(
  source: GallerySource,
  search: string,
  criteria: TrackGalleryCriteria,
  sort: TrackGallerySort,
): UseTrackGalleryResult {
  const { status } = useAuth();
  // Read through a ref inside fetchPage so a sign-in does not change that callback's identity
  // and re-fire every in-flight page; the next fetch picks the new value up.
  const signedInRef = useRef(status === "signed-in");
  signedInRef.current = status === "signed-in";
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
  // Guards every async write: a filter change while a page is in flight must not append that
  // page to the new list. Same one-request-wins pattern as tracksStore and eventsStore.
  const requestIdRef = useRef(0);
  const offsetRef = useRef(0);

  // WHY A FAILED PAGE MUST NOT RETRY ITSELF. The scroll sentinel re-arms whenever loadMore changes
  // identity, and loadMore changes identity when loadingMore flips back to false — which is
  // exactly what a failed request does. The sentinel is still on screen, so its fresh observer
  // fires at once, asks for the same page, fails, flips again: one 429 became 114 requests in
  // 5 seconds, all refused, all counted against the rate limit that caused the first one.
  //
  // So failure is a STATE, not a blip. `blockedRef` is what loadMore checks (a ref, so the check
  // is immediate rather than a render behind); `loadMoreProblem` is the same fact for the UI,
  // and while it is set `hasMore` is false, so the sentinel is not mounted to fire at all.
  // `inFlightRef` makes "one page request at a time" true by construction.
  const [loadMoreProblem, setLoadMoreProblem] = useState<LoadMoreProblem | null>(null);
  const blockedRef = useRef(false);
  const inFlightRef = useRef(false);
  // One automatic retry per stretch of failures, restored by any page that succeeds. Beyond it
  // only a person can ask again, so the worst case is bounded by how fast someone can click.
  const autoRetriesLeftRef = useRef(1);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCooldown = useCallback(() => {
    if (cooldownTimerRef.current !== null) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = null;
  }, []);
  // A timer must not outlive the gallery.
  useEffect(() => clearCooldown, [clearCooldown]);
  // Loaded ONLY when the rider actually asks for their own rides, not on open.
  //
  // This is authenticated. If the 15-minute access token has expired while the organizer was
  // filling in the form, a refused refresh ends in SESSION_EXPIRED, which AuthContext handles
  // with a hard window.location.replace("/login") — the document blanks mid-navigation. The
  // gallery used to open with a burst of authenticated calls, one per visible card, which made
  // that likely; it is now two requests. Nothing needs My Rides until the toggle is pressed, so
  // it is still not fetched until then.
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
      // The rider's filters + sort + search go on the query string here — the server does the
      // narrowing (the list is paged, so filtering the 24 loaded rows client-side would be
      // wrong). buildTrackGalleryQuery always sends `sort` (default "newest" = created_at DESC,
      // the stable paging key) and omits any filter left at its default.
      const params = buildTrackGalleryQuery(criteria, sort, debouncedSearch);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      // AUTHENTICATED WHEN THERE IS SOMEONE TO AUTHENTICATE, anonymous otherwise.
      //
      // The list itself is public and the token changes nothing about which rides come back.
      // It is sent so the server can answer the two questions only this rider can be asked —
      // have I liked this track, have I saved it — and so `favoritesOnly` has someone to scope
      // to. Without it every heart renders empty however many the rider has saved.
      //
      // This is ONE request per page, not one per card, so it cannot produce a burst of 401s:
      // apiRequest refreshes and retries a single expired token quietly, which is exactly what
      // it is for.
      const page = await apiRequestPaged<EventSummary>(`/events/public?${params.toString()}`, {
        anonymous: !signedInRef.current,
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
    [debouncedSearch, criteria, sort],
  );

  // First page, and a fresh one whenever the search text changes. Only the public list pages;
  // "mine" comes from the store above.
  useEffect(() => {
    if (source !== "all") return;
    const thisRequest = ++requestIdRef.current;
    offsetRef.current = 0;
    // A new list (search, filter, sort) starts with a clean slate: no stale failure, no stale
    // timer aimed at the previous list.
    clearCooldown();
    blockedRef.current = false;
    inFlightRef.current = false;
    autoRetriesLeftRef.current = 1;
    setLoadMoreProblem(null);
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
  }, [fetchPage, source, clearCooldown]);

  // Deliberately not the sentinel's business: a failure blocks further automatic loading (see
  // the note on blockedRef), and the only ways past the block are the one timed retry below and
  // the rider's explicit retry().
  const loadMoreRef = useRef<() => void>(() => {});
  const loadMore = useCallback(() => {
    if (source !== "all" || publicLoading) return;
    if (blockedRef.current || inFlightRef.current) return;
    if (offsetRef.current >= publicTotal) return;
    const thisRequest = requestIdRef.current;
    inFlightRef.current = true;
    setLoadingMore(true);
    (async () => {
      try {
        await fetchPage(offsetRef.current, thisRequest);
        if (thisRequest !== requestIdRef.current) return;
        // A page landed: the API is answering, so the next failure earns its retry again.
        autoRetriesLeftRef.current = 1;
      } catch (err) {
        if (thisRequest !== requestIdRef.current) return;
        blockedRef.current = true;
        const limited = err instanceof ApiError && err.status === 429;
        if (limited && autoRetriesLeftRef.current > 0) {
          autoRetriesLeftRef.current -= 1;
          // Honour what the server asked for (Retry-After / the limiter's reset), plus a second
          // so the retry does not land on the very tick the window ends.
          const asked = err.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_S;
          const waitS = Math.min(Math.max(asked, 1), MAX_RATE_LIMIT_WAIT_S) + 1;
          setLoadMoreProblem({ kind: "rate-limited", retryInSeconds: waitS });
          clearCooldown();
          cooldownTimerRef.current = setTimeout(() => {
            cooldownTimerRef.current = null;
            if (thisRequest !== requestIdRef.current) return;
            // The one controlled retry: unblock and go straight through loadMore (not via the
            // sentinel). If it fails, autoRetriesLeft is 0 and it stays blocked.
            blockedRef.current = false;
            setLoadMoreProblem(null);
            loadMoreRef.current();
          }, waitS * 1000);
        } else {
          setLoadMoreProblem({ kind: limited ? "rate-limited" : "failed", retryInSeconds: null });
        }
      } finally {
        if (thisRequest === requestIdRef.current) {
          inFlightRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, [fetchPage, source, publicLoading, publicTotal, clearCooldown]);
  loadMoreRef.current = loadMore;

  // The rider's explicit "Try again". Whatever failed is what gets asked again — once.
  const retry = useCallback(() => {
    clearCooldown();
    blockedRef.current = false;
    setLoadMoreProblem(null);
    if (offsetRef.current === 0) {
      // The FIRST page never landed (there is nothing on screen to scroll from). Refetch it the
      // way the list's own effect does.
      const thisRequest = ++requestIdRef.current;
      inFlightRef.current = false;
      setPublicLoading(true);
      setError(null);
      (async () => {
        try {
          await fetchPage(0, thisRequest);
        } catch {
          if (thisRequest !== requestIdRef.current) return;
          setError("Could not load tracks right now.");
        } finally {
          if (thisRequest === requestIdRef.current) setPublicLoading(false);
        }
      })();
      return;
    }
    loadMoreRef.current();
  }, [clearCooldown, fetchPage]);

  const rides = useMemo(() => {
    // "All rides" is already filtered AND sorted by the server (buildTrackGalleryQuery). "My
    // rides" is one fully-loaded page from the store, so the identical criteria + sort are
    // applied here in memory instead — same helper, so the two sources behave the same.
    const base =
      source === "mine" ? applyTrackGalleryCriteria(myRides, criteria, sort, search) : publicRides;
    return base.filter((e) => !hasNoTrack(e));
  }, [source, myRides, publicRides, criteria, sort, search]);

  const loading = source === "mine" ? myRidesLoading && myRides.length === 0 : publicLoading;
  const total = source === "mine" ? rides.length : publicTotal;
  // False while a failure is being held: the sentinel is only mounted when there is more AND
  // nothing has gone wrong, so it cannot re-arm a failed page.
  const hasMore = source === "all" && offsetRef.current < publicTotal && loadMoreProblem === null;

  return {
    rides,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    loadMoreProblem,
    retry,
  };
}
