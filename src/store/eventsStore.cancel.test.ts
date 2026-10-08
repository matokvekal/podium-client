// Prod bug 2026-10-08: a ride its organizer cancelled stayed on My Rides — the ride page never
// told the shared list or the device cache, and My Rides paints the cache first. A cancelled ride
// must leave both at once, and a cached copy of one must never be painted.

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
const getCachedEvents = vi.fn();
const deleteCachedEvent = vi.fn();
const putCachedEvent = vi.fn();

vi.mock("../lib/api-client", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));
vi.mock("../lib/local-db", () => ({
  getCachedEvents: (...a: unknown[]) => getCachedEvents(...a),
  putCachedEvents: vi.fn(async () => undefined),
  putCachedEvent: (...a: unknown[]) => putCachedEvent(...a),
  deleteCachedEvent: (...a: unknown[]) => deleteCachedEvent(...a),
  clearCachedEvents: vi.fn(async () => undefined),
  clearUserScopedCache: vi.fn(async () => undefined),
  toggleFavorite: vi.fn(async () => false),
}));

const { useEventsStore } = await import("./eventsStore");
import type { EventSummary } from "../lib/local-db";

const ride = (id: string, status = "published") => ({ id, name: id, status }) as unknown as EventSummary;

beforeEach(() => {
  for (const m of [apiRequest, getCachedEvents, deleteCachedEvent, putCachedEvent]) m.mockReset();
  useEventsStore.setState({ myRides: [ride("a"), ride("b")], joinedRideIds: ["b"] });
});

describe("cancelled rides leave My Rides", () => {
  it("removeRide: out of the list, the joined ids and the device cache", () => {
    useEventsStore.getState().removeRide("b");
    expect(useEventsStore.getState().myRides.map((r) => r.id)).toEqual(["a"]);
    expect(useEventsStore.getState().joinedRideIds).toEqual([]);
    expect(deleteCachedEvent).toHaveBeenCalledWith("b");
  });

  it("upsertRide of a cancelled ride removes it instead of filing it", () => {
    useEventsStore.getState().upsertRide(ride("a", "cancelled"));
    expect(useEventsStore.getState().myRides.map((r) => r.id)).toEqual(["b"]);
    expect(deleteCachedEvent).toHaveBeenCalledWith("a");
    expect(putCachedEvent).not.toHaveBeenCalled();
  });

  it("a cached cancelled ride is never painted, even when the refresh fails (offline)", async () => {
    useEventsStore.setState({ myRides: [], joinedRideIds: [] });
    getCachedEvents.mockResolvedValue([ride("a"), ride("gone", "cancelled")]);
    apiRequest.mockRejectedValue(new Error("offline"));
    await useEventsStore.getState().loadMyRides(true);
    expect(useEventsStore.getState().myRides.map((r) => r.id)).toEqual(["a"]);
  });
});
