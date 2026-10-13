import type { StudioLocale } from "../engine/types";
import { en, type StudioKey } from "./en";
import { he } from "./he";

export type { StudioKey };

const DICTIONARIES: Record<StudioLocale, Record<StudioKey, string>> = { en, he };

export const STUDIO_LOCALES: readonly StudioLocale[] = ["en", "he"];

/** Text direction for a studio language. Hebrew is right-to-left; the shell is `<html lang="en">`
 *  with no dir, so the studio sets it on its own root. */
export function localeDir(locale: StudioLocale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Looks a key up; `{name}` style placeholders are filled from `params`. A key missing from the
 *  language falls back to English rather than rendering blank. */
export function t(
  locale: StudioLocale,
  key: StudioKey,
  params?: Record<string, string | number>,
): string {
  const raw = DICTIONARIES[locale][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

/** Date + time in the studio's language, in the organizer's own time zone — the same wall-clock
 *  the ride will be stored from. */
export function formatStart(locale: StudioLocale, startsAt: string): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatNumber(locale: StudioLocale, value: number, digits = 0): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-GB", {
    maximumFractionDigits: digits,
  }).format(value);
}
