// Asks the server to route every segment that is waiting for it — and nothing else.
//
// Fed the whole draft after every change (sync). It works out which segments are pending,
// waits for the rider to stop moving (debounce), and sends a few requests at a time. A request
// whose segment has since changed is aborted; an answer that arrives anyway is still harmless,
// because model.applyRouted ignores any answer whose key no longer matches. Answers are cached
// by key, so undo/redo and "dragged it back" need no request at all.

import { ApiError, apiRequest } from "../lib/api-client";
import type { LatLng, RouteDraft, RoutedGeometry, RoutingProfile } from "./model";

export type FetchSegment = (
  from: LatLng,
  to: LatLng,
  profile: RoutingProfile,
  signal: AbortSignal,
) => Promise<RoutedGeometry>;

export interface RoutingQueueOptions {
  fetchSegment: FetchSegment;
  onResult(segmentId: string, key: string, routed: RoutedGeometry): void;
  onError(segmentId: string, key: string, message: string): void;
  debounceMs?: number;
  concurrency?: number;
}

const CACHE_LIMIT = 300;

export class RoutingQueue {
  private readonly inflight = new Map<string, AbortController>();
  private readonly cache = new Map<string, RoutedGeometry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: RouteDraft | null = null;
  private disposed = false;

  constructor(private readonly options: RoutingQueueOptions) {}

  sync(draft: RouteDraft): void {
    if (this.disposed) return;
    this.latest = draft;
    const wanted = new Set(
      draft.segments.filter((s) => s.status === "pending").map((s) => `${s.id}|${s.key}`),
    );
    for (const [token, controller] of this.inflight) {
      if (!wanted.has(token)) {
        controller.abort();
        this.inflight.delete(token);
      }
    }
    this.schedule(this.options.debounceMs ?? 250);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pump(), delay);
  }

  private pump(): void {
    this.timer = null;
    const draft = this.latest;
    if (!draft || this.disposed) return;
    const limit = this.options.concurrency ?? 3;

    draft.segments.forEach((seg, i) => {
      if (seg.status !== "pending") return;
      const token = `${seg.id}|${seg.key}`;
      if (this.inflight.has(token)) return;
      const cached = this.cache.get(seg.key);
      if (cached) {
        this.options.onResult(seg.id, seg.key, cached);
        return;
      }
      if (this.inflight.size >= limit) return;
      const from = draft.waypoints[i]?.position;
      const to = draft.waypoints[i + 1]?.position;
      if (!from || !to) return;

      const controller = new AbortController();
      this.inflight.set(token, controller);
      this.options
        .fetchSegment(from, to, seg.profile, controller.signal)
        .then((routed) => {
          this.remember(seg.key, routed);
          if (!controller.signal.aborted) this.options.onResult(seg.id, seg.key, routed);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          this.options.onError(seg.id, seg.key, routingErrorMessage(err));
        })
        .finally(() => {
          if (this.inflight.get(token) === controller) this.inflight.delete(token);
          // Something may still be queued behind the concurrency limit.
          if (!this.disposed) this.schedule(0);
        });
    });
  }

  private remember(key: string, routed: RoutedGeometry): void {
    this.cache.set(key, routed);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}

export function routingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return "No bike route to this point — drag it onto a road.";
    if (err.status === 429) return "Too many changes at once — retry in a moment.";
    if (err.status === 400 && err.message) return err.message;
  }
  return "Routing is unavailable right now.";
}

/** The real fetcher: POST /route-builder/segment. */
export const fetchSegmentFromServer: FetchSegment = async (from, to, profile, signal) => {
  const data = await apiRequest<{ points: [number, number, number | null][]; distanceM: number }>(
    "/route-builder/segment",
    {
      method: "POST",
      body: { from: { lat: from[0], lng: from[1] }, to: { lat: to[0], lng: to[1] }, profile },
      signal,
    },
  );
  return { points: data.points };
};
