/**
 * A page's read/write handle onto the one live-location watcher LiveLocationProvider.tsx owns.
 * Reads status + the rider's own fix from the shared store; start()/stop() reach the real
 * watcher through app/liveLocationController.ts's imperative bridge.
 */

import { useLiveLocationStore } from "../store/liveLocationStore";
import { requestLiveLocationStart, requestLiveLocationStop } from "./liveLocationController";
import type { BroadcastStatus } from "./useLocationBroadcast";

interface Result {
  status: BroadcastStatus;
  selfPosition: [number, number] | null;
  start(): void;
  stop(): void;
}

export function useLiveLocation(): Result {
  const status = useLiveLocationStore((s) => s.status);
  const selfPosition = useLiveLocationStore((s) => s.selfPosition);
  return { status, selfPosition, start: requestLiveLocationStart, stop: requestLiveLocationStop };
}
