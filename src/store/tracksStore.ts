// Find Tracks — the public route library, wired to the real endpoint.
//
// THE BUG THIS FIXES: loadTracks used to `set({ tracks: [] })` unconditionally. It never made
// a request. Its comment said "GET /tracks does not exist server-side", and that was true of
// that path — but the endpoint exists under a different name, has for a while, and is
// unauthenticated:
//
//     GET /api/v1/routes/public  ->  200 {"data":[],"total":0,"page":1,"pageSize":24}
//
// So Find Tracks could never show a route no matter what was in the database, and no filter,
// cache or permission was involved. The comment went stale and the empty array stayed.
//
// Anonymous on purpose: browsing the library is a front door for someone with no account,
// exactly like the public event list, and the server registers this route without requireAuth.
//
// Favourites are in-memory and client-only — there is no server column for them. They are
// deliberately NOT persisted or presented as anything more than a per-session marker.
//
// PAGING: real page/pageSize against the server, appended page by page as the rider scrolls
// (TracksPage's infinite-scroll list), the same shape as useTrackGallery's `total`-driven
// paging over /events/public. `total` now comes from apiRequestPaged instead of being dropped.

import { create } from "zustand";
import { apiRequestPaged } from "../lib/api-client";
import type { PublicRoute, TrackFilters } from "../lib/track-types";

interface TracksState {
  tracks: PublicRoute[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Route ids favourited this session. Client-only; see the file comment. */
  favoriteIds: number[];
  loadTracks(filters?: TrackFilters): Promise<void>;
  loadMore(): Promise<void>;
  toggleFavoriteTrack(id: number): void;
}

let requestId = 0;
let currentFilters: TrackFilters | undefined;
let currentPage = 1;

/** Server max (routeLibrary.schemas.ts). One request per scroll page, not the whole library. */
const PAGE_SIZE = 60;

function toQueryString(filters: TrackFilters | undefined, page: number): string {
  const params = new URLSearchParams();
  // Only send a filter the rider actually set. An empty string or a slider still at its
  // extreme is "no opinion", and sending it would exclude routes with a null distance/climb.
  if (filters?.place?.trim()) params.set("place", filters.place.trim());
  if (filters?.routeType) params.set("type", filters.routeType);
  if (filters?.minDistanceKm != null) params.set("minDistance", String(filters.minDistanceKm));
  if (filters?.maxDistanceKm != null) params.set("maxDistance", String(filters.maxDistanceKm));
  if (filters?.minClimbM != null) params.set("minElevation", String(filters.minClimbM));
  if (filters?.maxClimbM != null) params.set("maxElevation", String(filters.maxClimbM));
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  return `?${params.toString()}`;
}

export const useTracksStore = create<TracksState>((set, get) => ({
  tracks: [],
  total: 0,
  loading: true,
  loadingMore: false,
  error: null,
  favoriteIds: [],

  async loadTracks(filters) {
    const thisRequest = ++requestId;
    currentFilters = filters;
    currentPage = 1;
    set({ loading: true, error: null });
    try {
      const page = await apiRequestPaged<PublicRoute>(
        `/routes/public${toQueryString(filters, currentPage)}`,
        { anonymous: true },
      );
      if (thisRequest !== requestId) return;
      set({ tracks: page.data, total: page.total, loading: false });
    } catch {
      if (thisRequest !== requestId) return;
      // The list is left alone rather than cleared: a failed refresh is not evidence that the
      // library is empty, and blanking it would look identical to "no public routes exist".
      set({ error: "Could not load tracks right now.", loading: false });
    }
  },

  async loadMore() {
    const { loading, loadingMore, tracks, total } = get();
    if (loading || loadingMore || tracks.length >= total) return;
    const thisRequest = requestId;
    const nextPage = currentPage + 1;
    set({ loadingMore: true });
    try {
      const page = await apiRequestPaged<PublicRoute>(
        `/routes/public${toQueryString(currentFilters, nextPage)}`,
        { anonymous: true },
      );
      if (thisRequest !== requestId) return;
      currentPage = nextPage;
      set((state) => {
        // Defensive: a route that shifted page between requests must not render twice and
        // hand React two children with the same key.
        const seen = new Set(state.tracks.map((t) => t.id));
        return {
          tracks: [...state.tracks, ...page.data.filter((t) => !seen.has(t.id))],
          total: page.total,
          loadingMore: false,
        };
      });
    } catch {
      if (thisRequest !== requestId) return;
      set({ loadingMore: false });
    }
  },

  toggleFavoriteTrack(id) {
    set((state) => ({
      favoriteIds: state.favoriteIds.includes(id)
        ? state.favoriteIds.filter((favoriteId) => favoriteId !== id)
        : [...state.favoriteIds, id],
    }));
  },
}));
