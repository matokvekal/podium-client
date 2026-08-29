// Starter country list for the registration/profile country picker.
//
// Deliberately short (top 20, not the full ISO-3166 list) — this is the first checkpoint of
// a bigger "filter rides by country" feature; the full list and server-side wiring land once
// the server/DB changes are in.
//
// `code` is the ISO 3166-1 alpha-2 country code — this becomes the value stored once the
// profile's country field exists server-side, so it stays stable even if `name` wording changes.
// The flag is derived from `code` (regional indicator symbols), not stored separately.
//
// The order of this array is NOT the order shown in the picker. The picker puts the default
// country (a saved pick, else the device/browser locale, else Israel) first and every other
// country alphabetically — see orderedCountries(). This array is kept alphabetical so any
// other reader gets a sensible order too.

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "DK", name: "Denmark" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

/** Where the picker lands when the device locale gives us no region we recognise. */
export const FALLBACK_COUNTRY_CODE = "IL";

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/** True if `code` is one of the countries in the list above. */
export function isKnownCountryCode(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code);
}

/**
 * The region subtag of the device/browser locale — "IL" for `he-IL`, "US" for `en-US`,
 * "GB" for `en-GB`. Returns null when there is no navigator, no language, or the locale
 * carries no region at all (a bare `en`). No geolocation, no network — locale only.
 */
export function deviceLocaleRegion(): string | null {
  try {
    const language = globalThis.navigator?.language;
    if (!language) return null;
    const region = new Intl.Locale(language).region;
    return region ? region.toUpperCase() : null;
  } catch {
    // A malformed navigator.language throws in the Intl.Locale constructor.
    return null;
  }
}

/**
 * The country the picker should default to based on the device locale: the detected region
 * if we have it in the list, otherwise Israel (FALLBACK_COUNTRY_CODE). This never overrides a
 * country the user has already saved — the caller checks the saved value first.
 */
export function detectDefaultCountryCode(): string {
  const region = deviceLocaleRegion();
  return isKnownCountryCode(region) ? region : FALLBACK_COUNTRY_CODE;
}

/**
 * COUNTRIES ordered for the picker: `firstCode` first, then every other country alphabetically
 * by name. `firstCode` appears once (never duplicated); an unknown `firstCode` is ignored and
 * the list stays fully alphabetical.
 */
export function orderedCountries(firstCode: string): Country[] {
  const alphabetical = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
  const first = BY_CODE.get(firstCode);
  if (!first) return alphabetical;
  return [first, ...alphabetical.filter((country) => country.code !== firstCode)];
}

/** "IL" -> "🇮🇱". Regional indicator symbols: each letter maps to U+1F1E6 + (letter - 'A'). */
export function flagEmoji(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}
