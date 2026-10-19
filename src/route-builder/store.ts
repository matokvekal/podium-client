// The Route Builder's state: the draft, plus undo/redo history.
//
// Every rider edit goes through `edit`, which keeps the previous draft for Undo. Routing
// answers go through `patch`, which does not — they are not something the rider did, and an
// Undo that only "un-routes" a line would feel broken. Old drafts in history may hold segments
// that were still pending when they were current; restoring one simply asks again, and the
// routing queue answers that from its cache.

import { create } from "zustand";
import { clearDraft } from "./draftStorage";
import { emptyDraft, type RouteDraft } from "./model";

export const HISTORY_LIMIT = 50;

interface RouteBuilderState {
  draft: RouteDraft;
  past: RouteDraft[];
  future: RouteDraft[];
  edit(change: (draft: RouteDraft) => RouteDraft): void;
  patch(change: (draft: RouteDraft) => RouteDraft): void;
  /** A whole new draft (resume, import, start over). Clears history. */
  reset(draft: RouteDraft): void;
  undo(): void;
  redo(): void;
}

export const useRouteBuilderStore = create<RouteBuilderState>()((set) => ({
  draft: emptyDraft(),
  past: [],
  future: [],

  edit(change) {
    set((state) => {
      const next = change(state.draft);
      if (next === state.draft) return state;
      return {
        draft: next,
        past: [...state.past, state.draft].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  },

  patch(change) {
    set((state) => {
      const next = change(state.draft);
      return next === state.draft ? state : { draft: next };
    });
  },

  reset(draft) {
    set({ draft, past: [], future: [] });
  },

  undo() {
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        draft: previous,
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future],
      };
    });
  },

  redo() {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        draft: next,
        past: [...state.past, state.draft].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    });
  },
}));

/** The builder's work is done (its track became a ride): forget the draft here and on disk. */
export function discardRouteBuilderDraft(): void {
  clearDraft();
  useRouteBuilderStore.getState().reset(emptyDraft());
}
