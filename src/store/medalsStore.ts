// Event Completion Medals — the rider's own collection (GET /medals/me), newest first, paged by
// the server's keyset cursor. Kept in memory only: medals are cheap to fetch and the "NEW" state
// must come from the server (seen_at), so nothing is cached on the device.

import { create } from "zustand";
import { apiRequest } from "../lib/api-client";
import type { EventMedal } from "../lib/medal";

export const MEDALS_PAGE_SIZE = 20;

interface MedalsPageResponse {
  medals: EventMedal[];
  nextCursor: string | null;
  total: number;
  unseen: number;
}

interface MedalsState {
  userId: number | null;
  medals: EventMedal[];
  nextCursor: string | null;
  total: number;
  loading: boolean;
  failed: boolean;
  /** Bumped on every reset — a response for an older request is dropped. */
  requestId: number;
  loadFirst(userId: number): Promise<void>;
  loadMore(): Promise<void>;
  /** Mark these rides' medals seen on the server (all when omitted). Never throws. The loaded
   *  cards keep `seen: false` on purpose: their NEW ribbon stays for the visit it was seen in. */
  markSeen(eventIds?: string[]): Promise<boolean>;
  reset(): void;
}

export async function fetchMedalsPage(
  cursor: string | null,
  limit = MEDALS_PAGE_SIZE,
): Promise<MedalsPageResponse> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("before", cursor);
  return apiRequest<MedalsPageResponse>(`/medals/me?${qs.toString()}`);
}

export const useMedalsStore = create<MedalsState>((set, get) => ({
  userId: null,
  medals: [],
  nextCursor: null,
  total: 0,
  loading: false,
  failed: false,
  requestId: 0,

  async loadFirst(userId) {
    const requestId = get().requestId + 1;
    set({ userId, requestId, loading: true, failed: false });
    try {
      const page = await fetchMedalsPage(null);
      if (get().requestId !== requestId) return;
      set({
        medals: page.medals,
        nextCursor: page.nextCursor,
        total: page.total,
        loading: false,
      });
    } catch {
      if (get().requestId !== requestId) return;
      set({ loading: false, failed: true });
    }
  },

  async loadMore() {
    const { nextCursor, loading, requestId } = get();
    if (!nextCursor || loading) return;
    set({ loading: true });
    try {
      const page = await fetchMedalsPage(nextCursor);
      if (get().requestId !== requestId) return;
      set((s) => ({
        medals: [...s.medals, ...page.medals],
        nextCursor: page.nextCursor,
        loading: false,
      }));
    } catch {
      if (get().requestId !== requestId) return;
      set({ loading: false });
    }
  },

  async markSeen(eventIds) {
    try {
      await apiRequest("/medals/me/seen", {
        method: "POST",
        body: eventIds ? { eventIds } : {},
      });
      return true;
    } catch {
      return false;
    }
  },

  reset() {
    set((s) => ({
      userId: null,
      medals: [],
      nextCursor: null,
      total: 0,
      loading: false,
      failed: false,
      requestId: s.requestId + 1,
    }));
  },
}));
