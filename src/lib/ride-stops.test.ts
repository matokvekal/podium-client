import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPlaceSearchUrl,
  kmAlongRoute,
  parsePlaceResults,
  searchPlaces,
  stopErrorMessage,
  stopGoogleMapsUrl,
} from "./ride-stops";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildPlaceSearchUrl (OpenStreetMap Nominatim)", () => {
  it("encodes Hebrew text and asks for Hebrew then English names", () => {
    const url = new URL(buildPlaceSearchUrl("  קפה ג'ו עין הוד "));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("קפה ג'ו עין הוד");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("accept-language")).toBe("he,en");
    expect(url.searchParams.has("viewbox")).toBe(false);
  });

  it("prefers places near the route with a padded viewbox (left,top,right,bottom), not a fence", () => {
    const url = new URL(
      buildPlaceSearchUrl("coffee", [
        [32.7, 34.95],
        [32.6, 35.05],
      ]),
    );
    expect(url.searchParams.get("viewbox")).toBe("34.90000,32.75000,35.10000,32.55000");
    expect(url.searchParams.has("bounded")).toBe(false);
  });
});

describe("parsePlaceResults", () => {
  it("keeps valid results and drops malformed ones", () => {
    const parsed = parsePlaceResults([
      { lat: "32.68", lon: "34.97", display_name: "עין הוד, חוף הכרמל" },
      { lat: "nope", lon: "34" },
      { lat: "95", lon: "34" },
      null,
      { lat: "32.1", lon: "34.8" },
    ]);
    expect(parsed).toEqual([
      { name: "עין הוד, חוף הכרמל", lat: 32.68, lng: 34.97 },
      { name: "32.1, 34.8", lat: 32.1, lng: 34.8 },
    ]);
  });

  it("anything that is not an array is no results", () => {
    expect(parsePlaceResults({ error: "x" })).toEqual([]);
    expect(parsePlaceResults(null)).toEqual([]);
  });
});

describe("searchPlaces", () => {
  it("blank text never makes a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchPlaces("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an HTTP failure so the UI can say so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(searchPlaces("coffee")).rejects.toThrow("429");
  });

  it("returns parsed results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "32", lon: "35", display_name: "Somewhere" }],
      }),
    );
    await expect(searchPlaces("somewhere")).resolves.toEqual([
      { name: "Somewhere", lat: 32, lng: 35 },
    ]);
  });
});

describe("stopGoogleMapsUrl", () => {
  it("is a plain lat,lng directions link — no API key", () => {
    expect(stopGoogleMapsUrl({ lat: 32.68, lng: 34.97 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=32.68%2C34.97",
    );
  });
});

describe("kmAlongRoute", () => {
  // A straight line north, ~11.1 km per 0.1° of latitude.
  const route: [number, number][] = [
    [32.0, 35.0],
    [32.1, 35.0],
    [32.2, 35.0],
  ];

  it("measures how far along the route a stop on it sits", () => {
    expect(kmAlongRoute(route, { lat: 32.15, lng: 35.0 })).toBeCloseTo(16.7, 0);
  });

  it("is null for a stop more than 1 km off the route, or with no route", () => {
    expect(kmAlongRoute(route, { lat: 32.1, lng: 35.1 })).toBeNull();
    expect(kmAlongRoute([], { lat: 32.1, lng: 35 })).toBeNull();
  });
});

describe("stopErrorMessage", () => {
  it("drops the server's (CODE) suffix", () => {
    expect(stopErrorMessage(new Error("This ride already has 5 stops (RIDE_STOPS_LIMIT)"), "x")).toBe(
      "This ride already has 5 stops",
    );
    expect(stopErrorMessage("weird", "Fallback")).toBe("Fallback");
  });
});
