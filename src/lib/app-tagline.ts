// The one-line "what is this app" under the El Niño Ride title in the header.
//
// The name alone did not tell people what the app is for, so the header carries a subtitle.
// It is shown in the rider's own language rather than English-for-everyone, because the
// people it exists for — someone who opened the app and does not yet know what it does — are
// exactly the ones least likely to read past a language they don't speak.
//
// Which language is a two-step guess, country first: the country the rider picked
// (store/countryStore.ts) is a deliberate statement about where they ride, so it outranks a
// phone that happens to be set to English. Only when that says nothing useful do we fall back
// to the device locale, which is what covers the languages the country picker has no entry
// for at all (Japanese, Chinese). English is the last resort.
//
// Display only — this is not app-wide i18n and nothing else here is translated.

export type TaglineLanguage = "he" | "en" | "es" | "de" | "ja" | "zh";

export const TAGLINES: Record<TaglineLanguage, string> = {
  he: "האפליקציה לרכיבות חברתיות",
  en: "The app for community rides",
  es: "La app para salidas en bici en grupo",
  de: "Die App für gemeinsame Radtouren",
  ja: "みんなで楽しむサイクリングのためのアプリ",
  zh: "社交骑行应用",
};

/**
 * Countries whose language we actually have a line for. Everything else in COUNTRIES
 * (France, Brazil, Italy…) is deliberately absent: with no translation to show, falling
 * through to the device locale and then English beats inventing one.
 *
 * Switzerland is three languages; German is the one most of it speaks, and a Swiss rider
 * whose phone is French/Italian still gets English rather than a language they don't read.
 * JP/CN/TW/HK are not in the picker today — they are here so the map stays correct if the
 * list grows, and the locale step below is what reaches those riders in the meantime.
 */
const COUNTRY_LANGUAGE: Record<string, TaglineLanguage> = {
  IL: "he",
  ES: "es",
  DE: "de",
  AT: "de",
  CH: "de",
  JP: "ja",
  CN: "zh",
  TW: "zh",
  HK: "zh",
  GB: "en",
  US: "en",
  AU: "en",
  CA: "en",
};

/** Primary subtag → line. "iw" is the legacy code for Hebrew and still turns up on older
 *  Android builds. All Chinese variants get the simplified line: a Traditional reader can
 *  read it, and it is far closer than English. */
const LOCALE_LANGUAGE: Record<string, TaglineLanguage> = {
  he: "he",
  iw: "he",
  es: "es",
  de: "de",
  ja: "ja",
  zh: "zh",
  en: "en",
};

/** The device's preferred languages, best first. Empty when there is no navigator at all
 *  (SSR, a test), which just means the caller falls through to English. */
export function deviceLocales(): string[] {
  const navigator = globalThis.navigator;
  if (!navigator) return [];
  const languages = navigator.languages;
  if (languages && languages.length > 0) return [...languages];
  return navigator.language ? [navigator.language] : [];
}

/**
 * Country wins when we have a line for it; otherwise the first device locale we recognise,
 * in the browser's own order of preference; otherwise English.
 */
export function taglineLanguage(
  country: string | null | undefined,
  locales: readonly string[] = deviceLocales(),
): TaglineLanguage {
  const byCountry = country ? COUNTRY_LANGUAGE[country.toUpperCase()] : undefined;
  if (byCountry) return byCountry;

  for (const locale of locales) {
    // "he-IL" → "he". Split rather than Intl.Locale: this only needs the primary subtag, and
    // a malformed value from a stored/injected locale should be skipped, not throw.
    const primary = locale.split("-")[0]?.toLowerCase();
    const byLocale = primary ? LOCALE_LANGUAGE[primary] : undefined;
    if (byLocale) return byLocale;
  }

  return "en";
}

/** The subtitle to render, with the `lang`/`dir` the element needs — Hebrew is RTL, and the
 *  app shell is `<html lang="en">` with no dir, so it has to say so itself. */
export function appTagline(
  country: string | null | undefined,
  locales?: readonly string[],
): { text: string; language: TaglineLanguage; dir: "rtl" | "ltr" } {
  const language = taglineLanguage(country, locales);
  return { text: TAGLINES[language], language, dir: language === "he" ? "rtl" : "ltr" };
}
