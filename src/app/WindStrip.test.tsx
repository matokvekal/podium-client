/**
 * @vitest-environment jsdom
 */

// End to end through the component: any viewer of a ride with a route and a start time gets the
// strip, drawn from ONE request for one place and cached under the event's own key; a ride with
// no start time, or a provider that is down, gets nothing and never an error.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountryStore } from "../store/countryStore";
import { WindStrip } from "./WindStrip";

const POINTS: [number, number][] = [
  [32.0, 34.8],
  [32.0, 34.9], // riding due east
  [32.0, 35.0],
];

function startsInTwoDays(): { iso: string; ms: number } {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setUTCMinutes(0, 0, 0);
  return { iso: d.toISOString(), ms: d.getTime() };
}

/** A reply shaped like Open-Meteo's, covering every hour of the days around the ride. */
function openMeteoReply(startMs: number) {
  const base = Math.floor(startMs / 1000 / 86400) * 86400 - 86400;
  const times = Array.from({ length: 72 }, (_, i) => base + i * 3600);
  const one = {
    hourly: {
      time: times,
      wind_speed_10m: times.map(() => 22),
      wind_direction_10m: times.map(() => 90),
      wind_gusts_10m: times.map(() => 35),
      temperature_2m: times.map(() => 19.4),
    },
  };
  return one;
}

function mockFetch(startMs: number) {
  const fn = vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => openMeteoReply(startMs),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  // Store first, storage second: the persisted country store writes its own key on setState.
  useCountryStore.setState({ code: null });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function strip(overrides: Partial<Parameters<typeof WindStrip>[0]["event"]> = {}) {
  const { iso } = startsInTwoDays();
  return (
    <WindStrip
      event={{ id: "evt-1", startsAt: iso, ...overrides }}
      points={POINTS}
      durationMin={90}
      routeDistanceKm={19}
    />
  );
}

describe("WindStrip availability", () => {
  it("any viewer gets the strip — no account flag, no ownership, no registration needed", async () => {
    const fetchMock = mockFetch(startsInTwoDays().ms);
    render(strip());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("WindStrip forecast", () => {
  it("draws one column per hour of the ride window from ONE request, and caches under the event key", async () => {
    const fetchMock = mockFetch(startsInTwoDays().ms);
    render(strip());

    // 90 min ride → window is start−1h … end+1h (3.5 h) → hourly columns at −1, 0, +1, +2 h.
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No caption, no "updated", no cache/explanatory text anywhere.
    expect(screen.queryByText(/wind forecast|updated|cache/i)).toBeNull();
    expect(screen.getAllByText("22")).toHaveLength(4);
    // The unit is printed ONCE, at the left of the speed row — not under every value.
    expect(screen.getAllByText("km/h")).toHaveLength(1);
    // Gust 35 vs 22 sustained → worth showing: one value per column and one row label.
    expect(screen.getAllByText("35")).toHaveLength(4);
    expect(screen.getAllByText("gust")).toHaveLength(1);
    // Gusts are PLAIN TEXT — no coloured cell — while the speed IS a coloured cell.
    for (const gust of screen.getAllByText("35")) expect(gust.getAttribute("style")).toBeNull();
    for (const speed of screen.getAllByText("22"))
      expect(speed.getAttribute("style")).toMatch(/background/);
    // Temperature: one plain-text row, unit label printed once.
    expect(screen.getAllByText("19°")).toHaveLength(4);
    expect(screen.getAllByText("°C")).toHaveLength(1);
    for (const t of screen.getAllByText("19°")) expect(t.getAttribute("style")).toBeNull();
    // No rider-position claims of any kind.
    expect(screen.queryByText(/headwind|tailwind|crosswind/i)).toBeNull();

    const keys = Object.keys(localStorage);
    expect(keys).toEqual(["elnino.wind.evt-1"]);
  });

  it("a second mount inside the TTL reads the cache and makes no second request", async () => {
    const fetchMock = mockFetch(startsInTwoDays().ms);
    const first = render(strip());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    first.unmount();

    render(strip());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Hebrew labels for an Israeli rider", async () => {
    mockFetch(startsInTwoDays().ms);
    useCountryStore.setState({ code: "IL" });
    render(strip());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
    expect(screen.queryByText(/תחזית רוח|עודכן/)).toBeNull();
    expect(screen.getAllByText("km/h")).toHaveLength(1);
    expect(screen.getAllByText("משבים")).toHaveLength(1);
    expect(screen.getAllByText("°C")).toHaveLength(1);
  });

  it("shows nothing (no error UI) when the provider is down and nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    const { container } = render(strip());
    await new Promise((r) => setTimeout(r, 30));
    expect(container.innerHTML).toBe("");
  });

  it("a ride with no start time gets no strip and no request", async () => {
    const fetchMock = mockFetch(Date.now());
    const { container } = render(strip({ startsAt: null }));
    await new Promise((r) => setTimeout(r, 30));
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
