import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRIES,
  detectDefaultCountryCode,
  deviceLocaleRegion,
  isKnownCountryCode,
  orderedCountries,
} from "./countries";

afterEach(() => {
  vi.unstubAllGlobals();
});

function withLanguage(language: unknown) {
  vi.stubGlobal("navigator", { language });
}

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

describe("detectDefaultCountryCode", () => {
  it("uses the locale region when it is a country we know", () => {
    withLanguage("he-IL");
    expect(detectDefaultCountryCode()).toBe("IL");
    withLanguage("en-US");
    expect(detectDefaultCountryCode()).toBe("US");
    withLanguage("en-GB");
    expect(detectDefaultCountryCode()).toBe("GB");
  });

  it("falls back to Israel for an unknown or missing region", () => {
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
