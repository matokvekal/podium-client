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

import { create } from "zustand";
import { apiRequest } from "../lib/api-client";
import type { PublicRoute, TrackFilters } from "../lib/track-types";

interface TracksState {
  tracks: PublicRoute[];
  loading: boolean;
  error: string | null;
  /** Route ids favourited this session. Client-only; see the file comment. */
  favoriteIds: number[];
  loadTracks(filters?: TrackFilters): Promise<void>;
  toggleFavoriteTrack(id: number): void;
}

let requestId = 0;

/**
 * The server caps pageSize at 60. The planner shows one card at a time and pages through them
 * locally, so one request of the maximum page is fetched rather than wiring a second paging
 * control on top of the first. `total` from the response is not surfaced for the same reason —
 * when the library outgrows 60 public routes this becomes a real paging job, and the query
 * builder below is already the place for it.
 */
const PAGE_SIZE = 60;

function toQueryString(filters: TrackFilters | undefined): string {
  if (!filters) return `?pageSize=${PAGE_SIZE}`;
  const params = new URLSearchParams();
  // Only send a filter the rider actually set. An empty string or a slider still at its
  // extreme is "no opinion", and sending it would exclude routes with a null distance/climb.
  if (filters.place?.trim()) params.set("place", filters.place.trim());
  if (filters.routeType) params.set("type", filters.routeType);
  if (filters.minDistanceKm != null) params.set("minDistance", String(filters.minDistanceKm));
  if (filters.maxDistanceKm != null) params.set("maxDistance", String(filters.maxDistanceKm));
  if (filters.minClimbM != null) params.set("minElevation", String(filters.minClimbM));
  if (filters.maxClimbM != null) params.set("maxElevation", String(filters.maxClimbM));
  params.set("pageSize", String(PAGE_SIZE));
  return `?${params.toString()}`;
}

export const useTracksStore = create<TracksState>((set) => ({
  tracks: [],
  loading: true,
  error: null,
  favoriteIds: [],

  async loadTracks(filters) {
    const thisRequest = ++requestId;
    set({ loading: true, error: null });
    try {
      const tracks = await apiRequest<PublicRoute[]>(`/routes/public${toQueryString(filters)}`, {
        anonymous: true,
      });
      if (thisRequest !== requestId) return;
      set({ tracks, loading: false });
    } catch {
      if (thisRequest !== requestId) return;
      // The list is left alone rather than cleared: a failed refresh is not evidence that the
      // library is empty, and blanking it would look identical to "no public routes exist".
      set({ error: "Could not load tracks right now.", loading: false });
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
