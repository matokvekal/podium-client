/**
 * @vitest-environment jsdom
 */

// Find Tracks / My Rides draw their maps from the tiny preview embedded in each list row.
//
// What this pins is the reason the change exists: scrolling used to cost one GET
// /events/:id/route per card, and the API rate-limits at 300 requests per 15 minutes, so about
// twelve pages of scrolling exhausted it and every map (and the list) failed. Now:
//
//   1. rendering a page of cards makes NO geometry request;
//   2. the detailed line is fetched only when a rider explores a card's map, once, and cached;
//   3. a ride with no track at all is dropped from the grid, but one whose preview is merely
//      missing (a server that has not run sql/046) still shows.
//
// api-client is mocked, so nothing reaches the network; Leaflet is replaced by a stub that
// records the points it is given and lets a test fire its "explore" signal.

import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../lib/local-db";

const apiRequest = vi.fn();
const apiRequestPaged = vi.fn();

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    apiRequestPaged: (...args: unknown[]) => apiRequestPaged(...args),
  };
});

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-out", profile: null }),
}));

vi.mock("../store/eventsStore", () => ({
  useEventsStore: (selector: (state: unknown) => unknown) =>
    selector({ myRides: [], myRidesLoading: false, loadMyRides: vi.fn() }),
}));

/** What the stub map was last handed, and its explore callback. */
const map = { points: [] as [number, number][], explore: () => {} };
vi.mock("./TrackMiniMap", () => ({
  default: (props: { points: [number, number][]; onExplore?: () => void }) => {
    map.points = props.points;
    map.explore = props.onExplore ?? (() => {});
    return <div data-testid="live-map" />;
  },
}));

// jsdom has no IntersectionObserver; report every card as on screen so its map mounts.
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", VisibleObserver);

const { TrackGalleryCard } = await import("./TrackGalleryCard");
const { useTrackGallery } = await import("./useTrackGallery");
const { DEFAULT_TRACK_GALLERY_CRITERIA } = await import("../lib/track-gallery-filter");

const PREVIEW = {
  points: [
    [32.0, 35.0],
    [32.01, 35.02],
    [32.02, 35.0],
  ] as [number, number][],
  elevations: [100, 140, 110],
};

function ride(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: "ride-1",
    code: "A1",
    name: "Judean loop",
    type: "RIDE",
    status: "finished",
    visibility: "public",
    routeId: 7,
    distanceKm: 21,
    elevationGain: 480,
    preview: PREVIEW,
    ...overrides,
  } as EventSummary;
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequestPaged.mockReset();
  map.points = [];
});

describe("TrackGalleryCard — drawn from the row", () => {
  it("renders the route and mounts its map with no geometry request at all", async () => {
    render(<TrackGalleryCard event={ride()} anonymousDetail onPick={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("live-map")).toBeTruthy());
    expect(map.points).toEqual(PREVIEW.points);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("draws nothing — and asks for nothing — for a row whose preview is missing", () => {
    render(
      <TrackGalleryCard
        event={ride({ id: "ride-2", preview: null })}
        anonymousDetail
        onPick={() => {}}
      />,
    );

    expect(screen.queryByTestId("live-map")).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("TrackGalleryCard — exploring fetches the detailed line, once", () => {
  const DETAIL = {
    points: Array.from({ length: 5 }, (_, i) => [32 + i * 0.001, 35] as [number, number]),
    distanceKm: 21,
    elevationM: 480,
  };

  it("swaps the detailed points in, and a second explore is served from the cache", async () => {
    apiRequest.mockResolvedValue(DETAIL);
    render(
      <TrackGalleryCard event={ride({ id: "ride-explore" })} anonymousDetail onPick={() => {}} />,
    );
    await waitFor(() => expect(screen.getByTestId("live-map")).toBeTruthy());

    act(() => map.explore());
    await waitFor(() => expect(map.points).toEqual(DETAIL.points));

    // The plain route endpoint (the detailed line) — not the old ?preview=1 — and anonymous for
    // the public list.
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/events/ride-explore/route", { anonymous: true });

    act(() => map.explore());
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps the preview when the detail request fails, and does not cache the failure", async () => {
    apiRequest.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(DETAIL);
    render(
      <TrackGalleryCard
        event={ride({ id: "ride-flaky" })}
        anonymousDetail={false}
        onPick={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("live-map")).toBeTruthy());

    act(() => map.explore());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(map.points).toEqual(PREVIEW.points);
    // My Rides is authenticated: it can hold a private ride.
    expect(apiRequest).toHaveBeenCalledWith("/events/ride-flaky/route", { anonymous: false });

    // Exploring again retries — the failure was not remembered.
    fireEvent.pointerDown(screen.getByTestId("live-map"));
    act(() => map.explore());
    await waitFor(() => expect(map.points).toEqual(DETAIL.points));
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});

describe("useTrackGallery — a page of rides is one request", () => {
  it("makes one list request, no geometry requests, and hides only rides with no track", async () => {
    apiRequestPaged.mockResolvedValue({
      data: [
        ride({ id: "with-track" }),
        ride({ id: "no-track", routeId: null, preview: null }),
        // A route exists but the server could not build a preview (sql/046 not run): still shown.
        ride({ id: "no-preview-yet", preview: null }),
      ],
      total: 3,
    });

    const { result } = renderHook(() =>
      useTrackGallery("all", "", DEFAULT_TRACK_GALLERY_CRITERIA, "newest"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rides.map((r) => r.id)).toEqual(["with-track", "no-preview-yet"]);
    expect(apiRequestPaged).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
