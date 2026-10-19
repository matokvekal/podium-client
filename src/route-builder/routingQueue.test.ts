import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api-client";
import { addWaypoint, applyRouted, emptyDraft, moveWaypoint, type RouteDraft } from "./model";
import { type FetchSegment, RoutingQueue, routingErrorMessage } from "./routingQueue";

const A: [number, number] = [31.85, 34.95];
const B: [number, number] = [31.83, 34.97];
const C: [number, number] = [31.75, 34.99];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness(fetchSegment: FetchSegment) {
  let draft: RouteDraft = emptyDraft("road");
  const errors: string[] = [];
  const queue = new RoutingQueue({
    fetchSegment,
    debounceMs: 250,
    onResult(id, key, routed) {
      draft = applyRouted(draft, id, key, routed);
      queue.sync(draft);
    },
    onError(_id, _key, message) {
      errors.push(message);
    },
  });
  return {
    queue,
    errors,
    get draft() {
      return draft;
    },
    set(next: RouteDraft) {
      draft = next;
      queue.sync(draft);
    },
  };
}

describe("RoutingQueue", () => {
  it("waits for the debounce, then routes the pending segment", async () => {
    const fetchSegment = vi.fn<FetchSegment>().mockResolvedValue({
      points: [
        [...A, 1],
        [...B, 2],
      ],
    });
    const h = harness(fetchSegment);
    h.set(addWaypoint(addWaypoint(emptyDraft(), A), B));
    expect(fetchSegment).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSegment).toHaveBeenCalledTimes(1);
    expect(h.draft.segments[0].status).toBe("ready");
  });

  it("aborts a request whose segment changed, and the late answer cannot overwrite the newer edit", async () => {
    const first = deferred<{ points: [number, number, number | null][] }>();
    const fetchSegment = vi
      .fn<FetchSegment>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({
        points: [
          [...A, null],
          [...C, null],
        ],
      });
    const h = harness(fetchSegment);
    h.set(addWaypoint(addWaypoint(emptyDraft(), A), B));
    await vi.advanceTimersByTimeAsync(250);
    const signal = fetchSegment.mock.calls[0][3];

    h.set(moveWaypoint(h.draft, h.draft.waypoints[1].id, C));
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(h.draft.segments[0].geometry.at(-1)).toEqual(C);

    // The old request answers after all — ignored.
    first.resolve({
      points: [
        [...A, null],
        [...B, null],
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.draft.segments[0].geometry.at(-1)).toEqual(C);
    expect(h.errors).toEqual([]);
  });

  it("only routes the segments that changed and answers repeats from its cache", async () => {
    const fetchSegment = vi.fn<FetchSegment>().mockImplementation(async (from, to) => ({
      points: [
        [...from, null],
        [...to, null],
      ],
    }));
    const h = harness(fetchSegment);
    h.set(addWaypoint(addWaypoint(addWaypoint(emptyDraft(), A), B), C));
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSegment).toHaveBeenCalledTimes(2);

    const original = h.draft;
    h.set(moveWaypoint(h.draft, h.draft.waypoints[2].id, [31.76, 34.99]));
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSegment).toHaveBeenCalledTimes(3);

    // "Undo": the original draft's segments are ready already; a pending copy of one is cached.
    h.set(moveWaypoint(h.draft, h.draft.waypoints[2].id, C));
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSegment).toHaveBeenCalledTimes(3);
    expect(h.draft.segments[1].status).toBe("ready");
    expect(original.segments[1].status).toBe("ready");
  });

  it("reports a failure", async () => {
    const h = harness(vi.fn<FetchSegment>().mockRejectedValue(new ApiError(422, "x")));
    h.set(addWaypoint(addWaypoint(emptyDraft(), A), B));
    await vi.advanceTimersByTimeAsync(250);
    expect(h.errors).toEqual(["No bike route to this point — drag it onto a road."]);
  });
});

describe("routingErrorMessage", () => {
  it("explains each failure in plain words", () => {
    expect(routingErrorMessage(new ApiError(422, "x"))).toBe(
      "No bike route to this point — drag it onto a road.",
    );
    expect(routingErrorMessage(new ApiError(503, "x"))).toBe("Routing is unavailable right now.");
    expect(routingErrorMessage(new ApiError(400, "Too far apart"))).toBe("Too far apart");
    expect(routingErrorMessage(new TypeError("fetch"))).toBe("Routing is unavailable right now.");
  });
});
