// Track/route library data for the "Find Tracks" planner.
//
// THERE IS NO DATA SOURCE YET. The hand-written mock library this used to read was deleted,
// and GET /tracks does not exist server-side (plan/server-tasks.md). loadTracks therefore
// resolves to an empty list and TracksPage shows its empty state — the honest answer, rather
// than invented tracks that made the planner look finished.
//
// To wire up the real endpoint, replace the empty result in loadTracks with the fetch. The
// filters argument is already threaded through and typed, and nothing else has to change.
//
// Favorite/like/comment state lives here only, in memory. Real persistence is a
// server-tasks.md item that lands with the endpoint.

import { create } from "zustand";
import type { Track, TrackComment, TrackFilters } from "../lib/track-types";

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

  async loadTracks(_filters) {
    const thisRequest = ++requestId;
    set({ loading: true, error: null });
    try {
      // Replace with the real request once GET /tracks exists:
      //   const tracks = await apiRequest<Track[]>("/tracks", { ... filters ... });
      const tracks: Track[] = [];
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
