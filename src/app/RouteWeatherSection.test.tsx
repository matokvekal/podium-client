/**
 * @vitest-environment jsdom
 */

// End to end: a long ride gets the section (one batched request, cached under user+event); a
// short ride gets nothing; a broken provider with nothing cached shows one small line, never an
// error that reaches the rest of the page.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountryStore } from "../store/countryStore";
import { RouteWeatherSection } from "./RouteWeatherSection";

const LONG_ROUTE: [number, number][] = [
  [0, 0],
  [0, 0.9], // ~100 km due east
];
const SHORT_ROUTE: [number, number][] = [
  [0, 0],
  [0, 0.36], // ~40 km due east
];

function futureStartIso(): string {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/** A reply shaped like Open-Meteo's, covering every hour of the days around `startMs`. */
function openMeteoReply(startMs: number) {
  const base = Math.floor(startMs / 1000 / 86400) * 86400 - 86400;
  const times = Array.from({ length: 72 }, (_, i) => base + i * 3600);
  const body = {
    hourly: {
      time: times,
      weathercode: times.map(() => 61),
      is_day: times.map(() => 1),
      temperature_2m: times.map(() => 17),
    },
  };
  return [body, body];
}

function mockFetch(startMs: number) {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => openMeteoReply(startMs),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  useCountryStore.setState({ code: null });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RouteWeatherSection", () => {
  it("renders nothing for a short route", () => {
    const { container } = render(
      <RouteWeatherSection
        event={{ id: "evt-1", startsAt: futureStartIso() }}
        userId={7}
        points={SHORT_ROUTE}
        durationMin={90}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the route's sampled points on a manual refresh, cached per user+event", async () => {
    const startIso = futureStartIso();
    const fetchMock = mockFetch(Date.parse(startIso));
    render(
      <RouteWeatherSection
        event={{ id: "evt-1", startsAt: startIso }}
        userId={7}
        points={LONG_ROUTE}
        durationMin={240}
      />,
    );
    // Not the ride's own calendar day yet, so no auto-fetch — the section shows only its header.
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getAllByText("17°").length).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("Finish")).toBeTruthy();
    expect(screen.getAllByText("🌦️").length).toBeGreaterThan(0); // code 61, light rain

    const keys = Object.keys(localStorage);
    expect(keys).toEqual(["elnino.routeWeather.7.evt-1"]);
  });

  it("shows a small local message on failure with nothing cached — never a global error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    render(
      <RouteWeatherSection
        event={{ id: "evt-1", startsAt: futureStartIso() }}
        userId={7}
        points={LONG_ROUTE}
        durationMin={240}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("Route forecast unavailable")).toBeTruthy());
  });
});
