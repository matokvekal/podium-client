/**
 * @vitest-environment jsdom
 */

// One failed page must never become a storm of requests.
//
// In production a 429 on page 13 of Find Tracks was followed by 114 more list requests in about
// five seconds, every one refused and every one counted against the rate limit that had caused the
// first: a failed page flipped `loadingMore` back to false, which gave `loadMore` a new identity,
// which re-armed the scroll sentinel, whose fresh observer fired at once because the sentinel was
// still on screen, which asked for the same page again.
//
// These tests render the REAL browser and the REAL hook. The only fake parts are the network, the
// card (irrelevant here) and IntersectionObserver — which is rigged to the worst case: every new
// observer reports the sentinel as visible the instant it is created, exactly like a sentinel that
// never leaves the screen. If anything re-arms itself, these counts explode.

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

// The card is not what is under test; a plain node keeps 24 of them cheap.
vi.mock("./TrackGalleryCard", () => ({
  TrackGalleryCard: ({ event }: { event: EventSummary }) => (
    <div data-testid="card">{event.name}</div>
  ),
}));

/** Worst case: a fresh observer reports "visible" immediately, every time. */
class AlwaysVisibleObserver {
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
vi.stubGlobal("IntersectionObserver", AlwaysVisibleObserver);

const { ApiError } = await import("../lib/api-client");
const { TrackGalleryBrowser } = await import("./TrackGalleryBrowser");

const TOTAL = 240; // ten pages of 24

function page(offset: number) {
  return {
    data: Array.from(
      { length: 24 },
      (_, i) =>
        ({
          id: `ride-${offset + i}`,
          name: `Ride ${offset + i}`,
          routeId: offset + i + 1,
          preview: null,
        }) as EventSummary,
    ),
    total: TOTAL,
  };
}

/** The offset a list request asked for. */
const offsetOf = (call: unknown[]): number =>
  Number(new URL(`http://x${call[0] as string}`).searchParams.get("offset"));

const rateLimited = (retryAfterSeconds: number | null = 30) =>
  new ApiError(429, "Too Many Requests", null, false, retryAfterSeconds);

/** Page 0 succeeds; everything after it is refused with `failure`. */
function firstPageOnly(failure: () => Error) {
  apiRequestPaged.mockImplementation(async (path: string) => {
    if (offsetOf([path]) === 0) return page(0);
    throw failure();
  });
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderBrowser() {
  return render(<TrackGalleryBrowser variant="page" onPick={() => {}} />);
}

/**
 * Requests for pages AFTER the first — the ones that can loop. (The first page is asked for twice
 * at mount, before and after the rider's country filter is seeded; that is a separate, harmless
 * quirk and is counted on its own in the first-page test.)
 */
const requests = () => apiRequestPaged.mock.calls.filter((call) => offsetOf(call) > 0).length;
const firstPageRequests = () =>
  apiRequestPaged.mock.calls.filter((call) => offsetOf(call) === 0).length;
const cards = () => screen.queryAllByTestId("card").length;

beforeEach(() => {
  vi.useFakeTimers();
  apiRequestPaged.mockReset();
  window.scrollTo = () => {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a failed page does not re-arm itself", () => {
  it("turns one 429 into exactly one refused request, not a storm", async () => {
    firstPageOnly(() => rateLimited(30));
    renderBrowser();
    await settle(400); // past the search debounce; page 0 and the first attempt at page 1

    // Page 1 was asked for once and refused. With the old code this number was in the hundreds.
    expect(requests()).toBe(1);
    expect(cards()).toBe(24);

    // The sentinel is still "on screen" to the rigged observer the whole time, and nothing else
    // asks: not in the next 25 s, which is inside the server's Retry-After of 30 s.
    await settle(25_000);
    expect(requests()).toBe(1);
  });

  it("keeps the already loaded cards usable and says what happened", async () => {
    firstPageOnly(() => rateLimited(30));
    renderBrowser();
    await settle(400);

    expect(cards()).toBe(24);
    expect(screen.getByRole("status").textContent).toContain("Too many requests");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("makes ONE retry after the server's Retry-After, and no more if that is refused too", async () => {
    firstPageOnly(() => rateLimited(30));
    renderBrowser();
    await settle(400);
    expect(requests()).toBe(1);

    // Not before the wait the server asked for (30 s, plus the one second of slack).
    await settle(30_000);
    expect(requests()).toBe(1);

    // The single controlled retry lands once the cooldown is over…
    await settle(2_000);
    expect(requests()).toBe(2);

    // …and when it is refused too, nothing further happens on its own — not after ten minutes.
    await settle(10 * 60_000);
    expect(requests()).toBe(2);
    expect(screen.getByRole("status").textContent).toContain("Still too many requests");
    expect(cards()).toBe(24);
  });

  it("caps the wait at the rate-limit window and uses a default when no header came", async () => {
    // No Retry-After at all: 60 s default (+1 s).
    firstPageOnly(() => rateLimited(null));
    renderBrowser();
    await settle(400);
    await settle(60_000);
    expect(requests()).toBe(1);
    await settle(2_000);
    expect(requests()).toBe(2);
  });

  it("never retries a non-429 failure on its own", async () => {
    firstPageOnly(() => new Error("network down"));
    renderBrowser();
    await settle(400);
    expect(requests()).toBe(1);

    await settle(30 * 60_000);
    expect(requests()).toBe(1);
    expect(screen.getByRole("status").textContent).toContain("Could not load more tracks");
  });

  it("an explicit Try again is exactly one request each time, however it ends", async () => {
    firstPageOnly(() => new Error("network down"));
    renderBrowser();
    await settle(400);
    expect(requests()).toBe(1);

    for (let click = 1; click <= 5; click++) {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await settle(50);
      expect(requests()).toBe(1 + click);
    }
    await settle(10 * 60_000);
    expect(requests()).toBe(6);
  });

  it("resumes loading normally once a retry succeeds", async () => {
    let refuse = true;
    apiRequestPaged.mockImplementation(async (path: string) => {
      const offset = offsetOf([path]);
      if (offset === 0) return page(0);
      if (refuse) throw new Error("blip");
      return page(offset);
    });
    renderBrowser();
    await settle(400);
    expect(cards()).toBe(24);

    refuse = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle(100);

    // The retry loaded page 1 and the bar is gone. (The rigged observer only fires when a new one
    // is created, so it does not keep scrolling like a real browser; what matters is that every
    // page after the refusal was asked for exactly once.)
    expect(screen.queryByRole("status")).toBeNull();
    expect(cards()).toBeGreaterThanOrEqual(48);
    const later = apiRequestPaged.mock.calls.map(offsetOf).filter((offset) => offset > 0);
    expect(later[0]).toBe(24); // the refused attempt
    expect(later[1]).toBe(24); // the explicit retry of that same page
    expect(new Set(later.slice(1)).size).toBe(later.length - 1); // and no page twice after it
  });
});

describe("the first page failing", () => {
  it("does not loop either, and Try again refetches it once", async () => {
    apiRequestPaged.mockRejectedValue(rateLimited(30));
    renderBrowser();
    await settle(400);
    const atMount = firstPageRequests(); // asked before and after the country seed
    expect(atMount).toBeLessThanOrEqual(2);
    expect(requests()).toBe(0); // and never a later page: there is nothing to scroll from

    // Ten minutes of a first page that will not load: not one more request.
    await settle(10 * 60_000);
    expect(firstPageRequests()).toBe(atMount);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle(50);
    expect(firstPageRequests()).toBe(atMount + 1);
  });
});
