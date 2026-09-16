// Country list for the registration/profile country picker.
//
// ~40 countries — the most common ones for cycling/riding, not the full ISO-3166 list. Still
// not exhaustive: the full list and server-side wiring land once that becomes a real need (see
// sql/030-country.sql — country is a free CHAR(2) with no server-side allow-list, so adding a
// country here is a client-only change, nothing to migrate).
//
// `code` is the ISO 3166-1 alpha-2 country code — this is the value stored in users.country /
// events.country, so it stays stable even if `name` wording changes. The flag is derived from
// `code` (regional indicator symbols), not stored separately.
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
  { code: "AE", name: "United Arab Emirates" },
  { code: "AR", name: "Argentina" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CO", name: "Colombia" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" },
  { code: "HR", name: "Croatia" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
  { code: "TR", name: "Turkey" },
  { code: "TW", name: "Taiwan" },
  { code: "US", name: "United States" },
  { code: "ZA", name: "South Africa" },
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
 * IANA time zones for the countries we support, as a zone -> country lookup.
 *
 * Only the zones belonging to COUNTRIES are listed; anything else falls through. The US and
 * Canada lists are the populated mainland zones plus the Alaska/Hawaii ones — enough to place
 * a real rider, not an exhaustive tzdata mirror. Australia is matched by prefix below.
 */
const TIME_ZONE_COUNTRY: Record<string, string> = {
  "Asia/Jerusalem": "IL",
  "Asia/Tel_Aviv": "IL",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Brussels": "BE",
  "Europe/Amsterdam": "NL",
  "Europe/Berlin": "DE",
  "Europe/Busingen": "DE",
  "Europe/Vienna": "AT",
  "Europe/Zurich": "CH",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Africa/Ceuta": "ES",
  "Europe/Lisbon": "PT",
  "Atlantic/Azores": "PT",
  "Atlantic/Madeira": "PT",
  "Europe/Athens": "GR",
  "Europe/Warsaw": "PL",
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Boise": "US",
  "America/Anchorage": "US",
  "America/Juneau": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Regina": "CA",
  "America/Sao_Paulo": "BR",
  "America/Bahia": "BR",
  "America/Fortaleza": "BR",
  "America/Recife": "BR",
  "America/Manaus": "BR",
  "America/Belem": "BR",
  "America/Cuiaba": "BR",
  "America/Campo_Grande": "BR",
  "America/Porto_Velho": "BR",
  "Asia/Dubai": "AE",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Argentina/Cordoba": "AR",
  "America/Argentina/Salta": "AR",
  "America/Argentina/Mendoza": "AR",
  "America/Bogota": "CO",
  "Europe/Prague": "CZ",
  "Europe/Tallinn": "EE",
  "Europe/Helsinki": "FI",
  "Europe/Zagreb": "HR",
  "Europe/Budapest": "HU",
  "Europe/Dublin": "IE",
  "Atlantic/Reykjavik": "IS",
  "Asia/Tokyo": "JP",
  "Europe/Vilnius": "LT",
  "Europe/Luxembourg": "LU",
  "America/Mexico_City": "MX",
  "America/Cancun": "MX",
  "America/Tijuana": "MX",
  "America/Monterrey": "MX",
  "America/Chihuahua": "MX",
  "Pacific/Auckland": "NZ",
  "Pacific/Chatham": "NZ",
  "Europe/Ljubljana": "SI",
  "Europe/Bratislava": "SK",
  "Europe/Istanbul": "TR",
  "Asia/Taipei": "TW",
  "Africa/Johannesburg": "ZA",
};

/**
 * Which country the device's CLOCK says it is in — "Asia/Jerusalem" -> "IL".
 *
 * This is the honest signal for *where the rider is*. navigator.language is the UI language,
 * which is a different question: a rider in Tel Aviv whose phone is set to English reports
 * `en-US`, and reading that as "United States" is exactly the bug this exists to avoid. The
 * time zone is set from the device's actual location and does not change with the menu
 * language.
 *
 * Returns null for a zone we do not map — including a country we do not support yet — or
 * where Intl is unavailable. The caller then falls back to the locale, then to Israel.
 */
export function deviceTimeZoneRegion(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return null;
    // Australia has a dozen zones and they all mean the same country here.
    const code = zone.startsWith("Australia/") ? "AU" : TIME_ZONE_COUNTRY[zone];
    return isKnownCountryCode(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * The country to default to: the device's TIME ZONE first, then the locale region, then
 * Israel (FALLBACK_COUNTRY_CODE).
 *
 * Time zone leads because it answers "where is this rider" while the locale answers "what
 * language do they read". They agree for a Hebrew phone in Israel and disagree for the very
 * common English-language phone in Israel, which used to default to the United States — both
 * the Find Rides filter AND the country stamped on every ride they created.
 *
 * The locale is kept as the second guess rather than dropped: it is still better than nothing
 * for a rider whose zone is not in the table above (a country we do not list yet).
 *
 * This never overrides a country the user has saved — the caller checks the saved value first.
 */
export function detectDefaultCountryCode(): string {
  const zoneRegion = deviceTimeZoneRegion();
  if (zoneRegion) return zoneRegion;
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

/**
 * Narrow a country list by what the rider typed, matching NAME or CODE.
 *
 * Both, because a two-letter code is what a rider who knows them will type ("SE") while the
 * name is what everyone else types ("swe"), and neither alone finds the other. An empty or
 * whitespace-only query returns the list untouched rather than nothing.
 *
 * Lives here rather than inline in the picker so the ordering and the searching that produce
 * the visible option list are one testable pair — a country the search cannot reach is a
 * country the rider cannot pick.
 */
export function searchCountries(countries: Country[], query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries;
  return countries.filter(
    (country) => country.name.toLowerCase().includes(q) || country.code.toLowerCase().includes(q),
  );
}

/** "IL" -> "🇮🇱". Regional indicator symbols: each letter maps to U+1F1E6 + (letter - 'A'). */
export function flagEmoji(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}
