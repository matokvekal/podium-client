// The country half of the Find Rides fix lives on the WIRE, not in memory: the public list is
// fetched with limit=100, so a country filter applied only after the response arrives would
// silently lose every ride past the hundredth. These pin the query string.
//
// lib/local-db is stubbed wholesale — the store reads and writes the IndexedDB cache around
// every fetch, and none of that is what is under test here.

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("../lib/api-client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock("../lib/local-db", () => ({
  getCachedEvents: vi.fn(async () => []),
  putCachedEvents: vi.fn(async () => undefined),
  putCachedEvent: vi.fn(async () => undefined),
  clearCachedEvents: vi.fn(async () => undefined),
  clearUserScopedCache: vi.fn(async () => undefined),
  toggleFavorite: vi.fn(async () => false),
}));

const { useEventsStore } = await import("./eventsStore");

/** The path the store asked for, as a URLSearchParams. */
function requestedParams(): URLSearchParams {
  const path = apiRequest.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(path.slice(path.indexOf("?") + 1));
}

describe("loadOtherRides — country on the query string", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue([]);
  });

  it("sends the chosen country to the server", async () => {
    await useEventsStore.getState().loadOtherRides("upcoming", "SE");
    expect(requestedParams().get("country")).toBe("SE");
  });

  it("omits country entirely for All countries, rather than sending an empty one", async () => {
    // An empty `country=` would hit the server's zod length(2) and 400 the whole list.
    await useEventsStore.getState().loadOtherRides("upcoming", null);
    expect(requestedParams().has("country")).toBe(false);
  });

  it("still sends the bucket and the 100-row cap alongside it", async () => {
    await useEventsStore.getState().loadOtherRides("finished", "IL");
    const params = requestedParams();
    expect(params.get("bucket")).toBe("finished");
    expect(params.get("sort")).toBe("latest");
    expect(params.get("limit")).toBe("100");
    expect(params.get("country")).toBe("IL");
  });
});
