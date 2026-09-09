import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRIES,
  detectDefaultCountryCode,
  deviceLocaleRegion,
  deviceTimeZoneRegion,
  isKnownCountryCode,
  orderedCountries,
  searchCountries,
} from "./countries";

afterEach(() => {
  vi.unstubAllGlobals();
});

function withLanguage(language: unknown) {
  vi.stubGlobal("navigator", { language });
}

/** The real Intl, captured before any stubbing so the stub below can keep the rest of it. */
const REAL_INTL = Intl;

/**
 * Stub the device clock's zone. Every detectDefaultCountryCode test has to set this, because
 * the time zone now OUTRANKS the locale — left unstubbed these tests would read the zone of
 * whatever machine happens to run them and pass or fail by geography.
 *
 * `Locale` is carried over explicitly: Intl's members are non-enumerable, so a bare spread
 * produces an object without it, and deviceLocaleRegion's `new Intl.Locale(...)` would then
 * throw and report "no region" for every locale — quietly turning the fallback tests green
 * for the wrong reason.
 */
function withTimeZone(timeZone: string | undefined) {
  vi.stubGlobal("Intl", {
    ...REAL_INTL,
    Locale: REAL_INTL.Locale,
    DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }),
  });
}

/** A zone deliberately absent from the table, to force the locale fallback path. */
const UNMAPPED_ZONE = "Antarctica/Troll";

describe("isKnownCountryCode", () => {
  it("accepts codes in the list, rejects everything else", () => {
    expect(isKnownCountryCode("IL")).toBe(true);
    expect(isKnownCountryCode("US")).toBe(true);
    expect(isKnownCountryCode("ZZ")).toBe(false);
    expect(isKnownCountryCode("il")).toBe(false); // case-sensitive: codes are upper-case
    expect(isKnownCountryCode(null)).toBe(false);
    expect(isKnownCountryCode(undefined)).toBe(false);
    expect(isKnownCountryCode(42)).toBe(false);
  });
});

describe("deviceLocaleRegion", () => {
  it("pulls the region out of the browser locale", () => {
    withLanguage("he-IL");
    expect(deviceLocaleRegion()).toBe("IL");
    withLanguage("en-US");
    expect(deviceLocaleRegion()).toBe("US");
    withLanguage("en-GB");
    expect(deviceLocaleRegion()).toBe("GB");
    withLanguage("fr-FR");
    expect(deviceLocaleRegion()).toBe("FR");
  });

  it("returns null when there is no usable region", () => {
    withLanguage("en"); // no region subtag
    expect(deviceLocaleRegion()).toBeNull();
    withLanguage("");
    expect(deviceLocaleRegion()).toBeNull();
    withLanguage(undefined);
    expect(deviceLocaleRegion()).toBeNull();
    withLanguage("not a locale!!");
    expect(deviceLocaleRegion()).toBeNull();
  });

  it("returns null when there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);
    expect(deviceLocaleRegion()).toBeNull();
  });
});

describe("deviceTimeZoneRegion", () => {
  it("maps the zones of countries we support", () => {
    withTimeZone("Asia/Jerusalem");
    expect(deviceTimeZoneRegion()).toBe("IL");
    withTimeZone("Europe/Stockholm");
    expect(deviceTimeZoneRegion()).toBe("SE");
    withTimeZone("America/New_York");
    expect(deviceTimeZoneRegion()).toBe("US");
    withTimeZone("Europe/London");
    expect(deviceTimeZoneRegion()).toBe("GB");
  });

  it("treats every Australian zone as Australia", () => {
    withTimeZone("Australia/Sydney");
    expect(deviceTimeZoneRegion()).toBe("AU");
    withTimeZone("Australia/Perth");
    expect(deviceTimeZoneRegion()).toBe("AU");
  });

  it("returns null for a zone we do not map, or no zone at all", () => {
    withTimeZone(UNMAPPED_ZONE);
    expect(deviceTimeZoneRegion()).toBeNull();
    withTimeZone("Asia/Tokyo"); // real place, country not in COUNTRIES
    expect(deviceTimeZoneRegion()).toBeNull();
    withTimeZone(undefined);
    expect(deviceTimeZoneRegion()).toBeNull();
  });
});

describe("detectDefaultCountryCode", () => {
  // THE bug this ordering exists for. A rider standing in Tel Aviv whose phone menus are in
  // English reports navigator.language "en-US". Reading that as the United States defaulted
  // their Find Rides filter to US AND stamped every ride they created as a US ride.
  it("believes the clock over the menu language for an English phone in Israel", () => {
    withTimeZone("Asia/Jerusalem");
    withLanguage("en-US");
    expect(detectDefaultCountryCode()).toBe("IL");
  });

  it("still gets a Hebrew phone in Israel right — the two signals agree", () => {
    withTimeZone("Asia/Jerusalem");
    withLanguage("he-IL");
    expect(detectDefaultCountryCode()).toBe("IL");
  });

  it("does not strand a real traveller: an Israeli phone in Sweden reads Sweden", () => {
    withTimeZone("Europe/Stockholm");
    withLanguage("he-IL");
    expect(detectDefaultCountryCode()).toBe("SE");
  });

  it("uses the locale region when the zone is one we do not map", () => {
    withTimeZone(UNMAPPED_ZONE);
    withLanguage("he-IL");
    expect(detectDefaultCountryCode()).toBe("IL");
    withLanguage("en-US");
    expect(detectDefaultCountryCode()).toBe("US");
    withLanguage("en-GB");
    expect(detectDefaultCountryCode()).toBe("GB");
  });

  it("falls back to Israel when neither signal gives a country we know", () => {
    withTimeZone(UNMAPPED_ZONE);
    withLanguage("en-ZZ"); // valid shape, not in our list
    expect(detectDefaultCountryCode()).toBe("IL");
    withLanguage("ja-JP"); // real country, just not in the short list
    expect(detectDefaultCountryCode()).toBe("IL");
    withLanguage("en");
    expect(detectDefaultCountryCode()).toBe("IL");
    vi.stubGlobal("navigator", undefined);
    expect(detectDefaultCountryCode()).toBe("IL");
  });
});

describe("orderedCountries", () => {
  it("puts the given country first, the rest alphabetically, with no duplicate", () => {
    const list = orderedCountries("IL");
    expect(list[0]?.code).toBe("IL");
    expect(list).toHaveLength(COUNTRIES.length);
    expect(list.filter((c) => c.code === "IL")).toHaveLength(1);

    const rest = list.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(rest[0]).toBe("Australia");
  });

  it("works for a US device", () => {
    const list = orderedCountries("US");
    expect(list[0]?.name).toBe("United States");
    expect(list.slice(1)[0]?.name).toBe("Australia");
    expect(list.filter((c) => c.code === "US")).toHaveLength(1);
  });

  it("stays fully alphabetical when the first code is unknown", () => {
    const list = orderedCountries("ZZ");
    expect(list).toHaveLength(COUNTRIES.length);
    const names = list.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("searchCountries", () => {
  // The bug this guards: Sweden is 18th of 20 once the rider's own country is pinned first,
  // and in the old native <select> that put it past the bottom of a phone viewport. The picker
  // that replaced it is only as good as its search, so the reachability of SE is pinned here.
  const israeliList = orderedCountries("IL");

  it("returns the whole list for an empty or whitespace query", () => {
    expect(searchCountries(israeliList, "")).toHaveLength(COUNTRIES.length);
    expect(searchCountries(israeliList, "   ")).toHaveLength(COUNTRIES.length);
  });

  it("finds Sweden by name, case-insensitively and part-way through", () => {
    expect(searchCountries(israeliList, "Sweden").map((c) => c.code)).toEqual(["SE"]);
    expect(searchCountries(israeliList, "swe").map((c) => c.code)).toEqual(["SE"]);
    expect(searchCountries(israeliList, "wed").map((c) => c.code)).toEqual(["SE"]);
  });

  it("finds Sweden by its two-letter code, in either case", () => {
    expect(searchCountries(israeliList, "SE").map((c) => c.code)).toEqual(["SE"]);
    expect(searchCountries(israeliList, "se").map((c) => c.code)).toContain("SE");
  });

  it("keeps Sweden present in the unsearched list — it must be pickable without typing", () => {
    expect(israeliList.map((c) => c.code)).toContain("SE");
    expect(israeliList[0]?.code).toBe("IL");
  });

  it("returns nothing for a query that matches no country", () => {
    expect(searchCountries(israeliList, "zzzz")).toEqual([]);
  });
});
