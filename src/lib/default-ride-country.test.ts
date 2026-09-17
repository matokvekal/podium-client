import { afterEach, describe, expect, it, vi } from "vitest";
import { countryFromOwnRides, defaultRideCountry } from "./default-ride-country";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The real Intl, captured before stubbing — see the same helper in countries.test.ts. */
const REAL_INTL = Intl;

/** Pin the device guess so the last-resort tests don't pass or fail by geography. */
function withTimeZone(timeZone: string) {
  vi.stubGlobal("Intl", {
    ...REAL_INTL,
    Locale: REAL_INTL.Locale,
    DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }),
  });
  vi.stubGlobal("navigator", { language: undefined });
}

function ride(country: string | null, startsAt: string | null = null) {
  return { country, startsAt };
}

describe("countryFromOwnRides", () => {
  it("returns null when the organiser has created nothing", () => {
    expect(countryFromOwnRides([])).toBeNull();
  });

  it("returns the country of a single past ride", () => {
    expect(countryFromOwnRides([ride("SE")])).toBe("SE");
  });

  it("picks the country most of their rides are in, not the odd one out", () => {
    // The one trip abroad must not re-stamp every later ride — events.country is what Find
    // Rides filters on.
    const rides = [ride("IL"), ride("IL"), ride("IL"), ride("IT")];
    expect(countryFromOwnRides(rides)).toBe("IL");
  });

  it("breaks a tie on the latest start date", () => {
    const rides = [ride("IL", "2026-01-10T06:00:00Z"), ride("SE", "2026-06-10T06:00:00Z")];
    expect(countryFromOwnRides(rides)).toBe("SE");
  });

  it("ignores rides with no country and codes this build does not know", () => {
    expect(countryFromOwnRides([ride(null), ride("ZZ"), ride("NO")])).toBe("NO");
    expect(countryFromOwnRides([ride(null), ride("ZZ")])).toBeNull();
  });

  it("still ranks a ride whose start date is missing or unparseable", () => {
    // It just sorts last on the tie-break; it must not disappear from the count.
    expect(countryFromOwnRides([ride("SE", null), ride("SE", "nonsense")])).toBe("SE");
  });
});

describe("defaultRideCountry", () => {
  it("prefers where the organiser already creates rides over their own profile country", () => {
    expect(defaultRideCountry({ ownRides: [ride("SE"), ride("SE")], profileCountry: "IL" })).toBe(
      "SE",
    );
  });

  it("falls back to the last ride created on this device before the profile", () => {
    // Covers the moment right after a create, before My Rides has been refetched.
    expect(defaultRideCountry({ lastUsedCountry: "IT", profileCountry: "IL" })).toBe("IT");
  });

  it("uses the profile country when the organiser has no rides yet", () => {
    expect(defaultRideCountry({ ownRides: [], profileCountry: "IL" })).toBe("IL");
  });

  it("falls through to the device guess when nothing else is known", () => {
    withTimeZone("Europe/Stockholm");
    expect(defaultRideCountry({})).toBe("SE");
  });

  it("never returns a code the picker has no option for", () => {
    withTimeZone("Europe/Stockholm");
    expect(
      defaultRideCountry({ ownRides: [ride("ZZ")], lastUsedCountry: "ZZ", profileCountry: "ZZ" }),
    ).toBe("SE");
  });
});
