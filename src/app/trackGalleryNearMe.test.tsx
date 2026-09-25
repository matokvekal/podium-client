/**
 * @vitest-environment jsdom
 */

// Near Me (app/TrackGalleryBrowser.tsx): a one-shot device fix requested only on tap, never on
// page load; permission denied / unsupported / any other geolocation failure must all leave the
// page fully usable; turning it off must restore exactly what was there before.
//
// Renders the REAL browser and the REAL hook — only the network and geolocation are faked.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../lib/local-db";

const apiRequestPaged = vi.fn();

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, apiRequestPaged: (...args: unknown[]) => apiRequestPaged(...args) };
});

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-out", profile: null }),
}));

vi.mock("../store/eventsStore", () => ({
  useEventsStore: (selector: (state: unknown) => unknown) =>
    selector({ myRides: [], myRidesLoading: false, loadMyRides: vi.fn() }),
}));

vi.mock("./TrackGalleryCard", () => ({
  TrackGalleryCard: ({ event }: { event: EventSummary }) => (
    <div data-testid="card">{event.name}</div>
  ),
}));

class NeverVisibleObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const { TrackGalleryBrowser } = await import("./TrackGalleryBrowser");

function page(over: Partial<{ data: EventSummary[]; total: number }> = {}) {
  return {
    data:
      over.data ??
      Array.from(
        { length: 24 },
        (_, i) =>
          ({ id: `ride-${i}`, name: `Ride ${i}`, routeId: i + 1, preview: null }) as EventSummary,
      ),
    total: over.total ?? 24,
  };
}

/** The query params a list request was made with. */
function paramsOf(call: unknown[]): URLSearchParams {
  return new URL(`http://x${call[0] as string}`).searchParams;
}

const lastParams = () => paramsOf(apiRequestPaged.mock.calls.at(-1) as unknown[]);
const cards = () => screen.queryAllByTestId("card").length;

function renderBrowser() {
  return render(<TrackGalleryBrowser variant="page" onPick={() => {}} />);
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Installs navigator.geolocation.getCurrentPosition with the given outcome. */
function stubGeolocation(outcome: { lat: number; lon: number } | { errorCode: number }) {
  const getCurrentPosition = vi.fn(
    (onSuccess: PositionCallback, onError?: PositionErrorCallback) => {
      if ("errorCode" in outcome) {
        onError?.({ code: outcome.errorCode, message: "" } as GeolocationPositionError);
      } else {
        onSuccess({
          coords: { latitude: outcome.lat, longitude: outcome.lon },
        } as GeolocationPosition);
      }
    },
  );
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition },
    permissions: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
  });
  return getCurrentPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", NeverVisibleObserver);
  apiRequestPaged.mockReset();
  apiRequestPaged.mockResolvedValue(page());
  window.scrollTo = () => {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Near Me — not requested until tapped", () => {
  it("never calls geolocation on mount", async () => {
    const getCurrentPosition = stubGeolocation({ lat: 32.05, lon: 34.78 });
    renderBrowser();
    await settle(400);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(lastParams().has("nearLat")).toBe(false);
  });
});

describe("Near Me — permission accepted", () => {
  it("refetches with nearLat/nearLon/nearRadiusKm=10 and sort=near_me", async () => {
    stubGeolocation({ lat: 32.05, lon: 34.78 });
    renderBrowser();
    await settle(400);
    apiRequestPaged.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(50);

    expect(apiRequestPaged).toHaveBeenCalled();
    const p = lastParams();
    expect(p.get("sort")).toBe("near_me");
    expect(p.get("nearLat")).toBe("32.05");
    expect(p.get("nearLon")).toBe("34.78");
    expect(p.get("nearRadiusKm")).toBe("10");
    expect(screen.getByRole("button", { name: /Near Me/ }).textContent).toContain("within 10 km");
  });

  it("turning it back off restores the query exactly as before", async () => {
    stubGeolocation({ lat: 32.05, lon: 34.78 });
    renderBrowser();
    await settle(400);

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(50);
    expect(lastParams().get("sort")).toBe("near_me");

    fireEvent.click(screen.getByRole("button", { name: /Near Me/ }));
    await settle(50);
    const p = lastParams();
    expect(p.has("nearLat")).toBe(false);
    expect(p.get("sort")).toBe("newest"); // the stored default — untouched by Near Me
  });
});

describe("Near Me — permission denied", () => {
  it("shows a friendly message and leaves the rest of the page usable", async () => {
    stubGeolocation({ errorCode: 1 }); // GeolocationPositionError.PERMISSION_DENIED
    renderBrowser();
    await settle(400);

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(50);

    expect(screen.getByText(/Couldn't use your location/)).toBeTruthy();
    expect(cards()).toBe(24);
    expect(lastParams().has("nearLat")).toBe(false);
  });
});

describe("Near Me — any other geolocation failure", () => {
  it("also degrades gracefully rather than retrying in a loop", async () => {
    stubGeolocation({ errorCode: 2 }); // POSITION_UNAVAILABLE
    renderBrowser();
    await settle(400);

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(50);
    apiRequestPaged.mockClear();

    await settle(60_000);
    expect(apiRequestPaged).not.toHaveBeenCalled();
    expect(cards()).toBe(24);
  });
});

describe("Near Me — 10km -> 20km one-shot expansion", () => {
  it("widens to 20 km exactly once when the first radius comes back empty", async () => {
    stubGeolocation({ lat: 32.05, lon: 34.78 });
    apiRequestPaged.mockImplementation(async (path: string) => {
      const radius = paramsOf([path]).get("nearRadiusKm");
      if (radius === "10") return page({ data: [], total: 0 });
      if (radius === "20") return page({ data: [], total: 0 });
      return page();
    });
    renderBrowser();
    await settle(400);

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(200);

    const radii = apiRequestPaged.mock.calls
      .map((call) => paramsOf(call as unknown[]).get("nearRadiusKm"))
      .filter((r): r is string => r !== null);
    expect(radii).toEqual(["10", "20"]);
    expect(screen.getByRole("button", { name: /Near Me/ }).textContent).toContain("within 20 km");

    // Still 0 at 20 km — must not try a third radius.
    await settle(5_000);
    expect(
      apiRequestPaged.mock.calls
        .map((call) => paramsOf(call as unknown[]).get("nearRadiusKm"))
        .filter((r): r is string => r !== null),
    ).toEqual(["10", "20"]);
  });

  it("does not expand when 10 km already has results", async () => {
    stubGeolocation({ lat: 32.05, lon: 34.78 });
    renderBrowser();
    await settle(400);

    fireEvent.click(screen.getByRole("button", { name: "Near Me" }));
    await settle(200);

    const radii = apiRequestPaged.mock.calls
      .map((call) => paramsOf(call as unknown[]).get("nearRadiusKm"))
      .filter((r): r is string => r !== null);
    expect(radii).toEqual(["10"]);
  });
});
