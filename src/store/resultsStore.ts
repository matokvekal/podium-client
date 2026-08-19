// Route + rider results for one event's results page, currently backed by
// lib/mock-results.ts (see plan/server-tasks.md) instead of a real endpoint. No IndexedDB
// caching layer here, unlike eventsStore.ts — there's no real network yet for a cache to
// protect against; add local-db.ts-style caching when loadResults calls a real apiRequest.

import { create } from "zustand";
import { type EventResults, getEventResults } from "../lib/mock-results";
import { getEventRoute } from "./eventRouteStore";

interface ResultsState {
  results: EventResults | null;
  loading: boolean;
  error: string | null;
  loadResults(eventId: string): Promise<void>;
}

let requestId = 0;

export const useResultsStore = create<ResultsState>((set) => ({
  results: null,
  loading: true,
  error: null,

  async loadResults(eventId) {
    const thisRequest = ++requestId;
    set({ loading: true, error: null });
    try {
      const results = await getEventResults(eventId);
      if (thisRequest !== requestId) return;
      // The organizer's actually-picked route wins over the deterministic mock — see
      // eventRouteStore.ts's doc comment.
      const pickedRoute = getEventRoute(eventId);
      set({
        results: pickedRoute ? { ...results, route: pickedRoute } : results,
        loading: false,
      });
    } catch {
      if (thisRequest !== requestId) return;
      set({ error: "Could not load results right now.", loading: false });
    }
  },
}));
