// "Can we currently reach the API?" — one flag, written only by lib/api-client.ts from what
// real requests actually did, read by the offline banner and by every page that wants to
// refetch the moment the server comes back.
//
// The distinction this file exists to make, and the only one that matters:
//
//   no response at all              → UNREACHABLE. A dead network, a refused connection, a
//                                     stopped server, a request the browser blocked (CORS).
//                                     ApiError.status === 0.
//   502 / 503 / 504                 → UNREACHABLE. A proxy answered, but it answered "the
//                                     application behind me is down", which is the same
//                                     situation for a rider as the server being off.
//   any other HTTP status           → REACHABLE. 401/403/404/409/422 and friends are the
//                                     server working correctly and disagreeing with us. A
//                                     business error is NOT offline, and showing "OFFLINE"
//                                     for a private event or an expired session would be a
//                                     lie that hides the real problem.
//
// navigator.onLine is deliberately not consulted here. It reports whether the device has *a*
// network, never whether OUR server is up, and treating it as authoritative is how a working
// app on a captive-portal wifi ends up insisting it is offline. lib/useOnlineStatus.ts still
// exposes it for copy that genuinely means "your device has no network".

import { create } from "zustand";

interface ConnectivityState {
  /** False only after a request proved the server unreachable; true again when one succeeds. */
  serverReachable: boolean;
  /** When a request last reached the server. Null until the first one does. */
  lastContactAt: number | null;
  /**
   * Incremented on every unreachable → reachable transition. Pages put this in a load
   * effect's dependency array to refetch on reconnect; it never changes while the server is
   * merely staying up, so it costs a re-render only at the moment recovery happens.
   */
  reconnectNonce: number;
  reportReachable(): void;
  reportUnreachable(): void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  // Optimistic: assume reachable until a request proves otherwise, so the banner never flashes
  // on a cold start before the first request has had a chance to succeed.
  serverReachable: true,
  lastContactAt: null,
  reconnectNonce: 0,

  reportReachable() {
    set((state) =>
      state.serverReachable
        ? { lastContactAt: Date.now() }
        : {
            serverReachable: true,
            lastContactAt: Date.now(),
            reconnectNonce: state.reconnectNonce + 1,
          },
    );
  },

  reportUnreachable() {
    set((state) => (state.serverReachable ? { serverReachable: false } : {}));
  },
}));

/** Non-hook writers, for lib/api-client.ts (which is not a component and holds no store). */
export function reportServerReachable(): void {
  useConnectivityStore.getState().reportReachable();
}

export function reportServerUnreachable(): void {
  useConnectivityStore.getState().reportUnreachable();
}

/** A gateway saying the app behind it is down counts as unreachable, not as a business error. */
export function isServerDownStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}
