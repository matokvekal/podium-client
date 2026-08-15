// Track/route library data for the "Find Tracks" planner, backed by lib/mock-tracks.ts (see
// plan/server-tasks.md) instead of a real GET /tracks. Same shape as resultsStore.ts.
//
// Favorite/like/comment state all live here only, in memory — no IndexedDB table for mock
// data. Real persistence is a server-tasks.md item once this is a real endpoint.

import { create } from "zustand";
import { getTracks, type Track, type TrackComment, type TrackFilters } from "../lib/mock-tracks";

interface TracksState {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  loadTracks(filters?: TrackFilters): Promise<void>;
  toggleFavoriteTrack(id: string): void;
  toggleLikeTrack(id: string): void;
  addComment(trackId: string, author: string, text: string): void;
}

let requestId = 0;
let commentId = 0;

export const useTracksStore = create<TracksState>((set) => ({
  tracks: [],
  loading: true,
  error: null,

  async loadTracks(filters) {
    const thisRequest = ++requestId;
    set({ loading: true, error: null });
    try {
      const tracks = await getTracks(filters);
      if (thisRequest !== requestId) return;
      set({ tracks, loading: false });
    } catch {
      if (thisRequest !== requestId) return;
      set({ error: "Could not load tracks right now.", loading: false });
    }
  },

  toggleFavoriteTrack(id) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id ? { ...track, favorite: !track.favorite } : track,
      ),
    }));
  },

  toggleLikeTrack(id) {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === id
          ? { ...track, liked: !track.liked, likes: track.likes + (track.liked ? -1 : 1) }
          : track,
      ),
    }));
  },

  addComment(trackId, author, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const comment: TrackComment = {
      id: `local-${++commentId}`,
      author,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, comments: [...track.comments, comment] } : track,
      ),
    }));
  },
}));
