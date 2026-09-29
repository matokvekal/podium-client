// The ride-cover catalog, fetched from the server instead of a compiled list — see
// lib/ride-images-dynamic.ts for why this exists alongside the older, still-present static
// lib/ride-images.ts.
//
// One fetch per session is enough: GET /api/v1/ride-images is small (a handful of rows) and the
// server itself caches it for ~30s (services/rideImages.service.ts), so there is no reason for
// every page that shows a ride cover to re-request it. `ensureLoaded` is idempotent and safe to
// call from every consumer's mount; `refresh` is for the admin page, right after it changes
// something, so its own table (and everyone else's picker) reflects the edit without waiting on
// the server's cache TTL or a full reload.

import { create } from "zustand";
import { apiRequest } from "../lib/api-client";

export interface RideImageDto {
  key: string;
  url: string;
  label: string;
  category: string;
  selectable: boolean;
}

interface RideImagesState {
  images: RideImageDto[] | null;
  loading: boolean;
  error: string | null;
  ensureLoaded(): Promise<void>;
  refresh(): Promise<void>;
}

export const useRideImagesStore = create<RideImagesState>()((set, get) => ({
  images: null,
  loading: false,
  error: null,

  async ensureLoaded() {
    if (get().images !== null || get().loading) return;
    await get().refresh();
  },

  async refresh() {
    set({ loading: true, error: null });
    try {
      const images = await apiRequest<RideImageDto[]>("/ride-images");
      set({ images, loading: false });
    } catch {
      // Leave `images` as whatever it was (null on first load, the last good list on a later
      // failed refresh) — lib/ride-images-dynamic.ts's static fallback covers the null case.
      set({ loading: false, error: "Could not load ride images" });
    }
  },
}));
