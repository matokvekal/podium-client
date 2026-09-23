// Ride chat unread state (lib/ride-chat.ts has the rules).
//
// PERSISTED: only `lastRead` — per ride, the id of the newest message this rider has seen —
// under "podium.rideChatLastRead". Never message bodies: the chat itself always comes from the
// server, so a cleared browser loses nothing but the badges' starting point.
//
// IN MEMORY: `summaries`, the server's answer to "how many unread, and what is the newest id"
// for the rides on screen. Refreshed by ONE request for the whole list (refreshUnread), never
// one per card. A ride missing from `summaries` is one this rider cannot chat in, and its card
// shows no chat icon at all.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiRequest } from "../lib/api-client";
import { buildUnreadQuery, type RideChatSummary } from "../lib/ride-chat";

interface RideChatState {
  lastRead: Record<string, number>;
  summaries: Record<string, RideChatSummary>;
  /** Record that this rider has read up to `messageId` in this ride (never moves backwards). */
  markRead(rideId: string, messageId: number): void;
  /** One request for all of `rideIds`. Failures keep the previous badges. */
  refreshUnread(rideIds: string[]): Promise<void>;
}

export const useRideChatStore = create<RideChatState>()(
  persist(
    (set, get) => ({
      lastRead: {},
      summaries: {},
      markRead: (rideId, messageId) =>
        set((s) => {
          const previous = s.lastRead[rideId] ?? 0;
          const summary = s.summaries[rideId];
          const latestId = Math.max(summary?.latestId ?? 0, messageId);
          return {
            lastRead: messageId > previous ? { ...s.lastRead, [rideId]: messageId } : s.lastRead,
            summaries: {
              ...s.summaries,
              [rideId]: { rideId, latestId: latestId || null, unread: 0 },
            },
          };
        }),
      refreshUnread: async (rideIds) => {
        const ids = [...new Set(rideIds)].filter(Boolean);
        if (ids.length === 0) return;
        const rides = buildUnreadQuery(ids, get().lastRead);
        try {
          const rows = await apiRequest<RideChatSummary[]>(
            `/events/chat/unread?rides=${encodeURIComponent(rides)}`,
          );
          set((s) => {
            const next = { ...s.summaries };
            for (const row of rows ?? []) next[row.rideId] = row;
            return { summaries: next };
          });
        } catch {
          // Offline or an older server without the endpoint — badges simply stay as they were.
        }
      },
    }),
    {
      name: "podium.rideChatLastRead",
      version: 1,
      partialize: (state) => ({ lastRead: state.lastRead }),
    },
  ),
);
