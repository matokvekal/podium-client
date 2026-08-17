// Starter country list for the registration/profile country picker.
//
// Deliberately short (top 20, not the full ISO-3166 list) — this is the first checkpoint of
// a bigger "filter rides by country" feature; the full list and server-side wiring land once
// the server/DB changes are in. Israel is first since most current riders are here; the rest
// is ordered by relevance to a cycling app (major cycling nations), not by population.
//
// `code` is the ISO 3166-1 alpha-2 country code — this becomes the value stored once the
// profile's country field exists server-side, so it stays stable even if `name` wording changes.
// The flag is derived from `code` (regional indicator symbols), not stored separately.

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "IL", name: "Israel" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "PL", name: "Poland" },
  { code: "GR", name: "Greece" },
];

/** "IL" -> "🇮🇱". Regional indicator symbols: each letter maps to U+1F1E6 + (letter - 'A'). */
export function flagEmoji(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}
