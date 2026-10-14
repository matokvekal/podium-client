/**
 * The organizer's own choice of language, remembered on this device.
 *
 * Priority for what the studio speaks: (1) a language the organizer picked themselves, (2) the
 * default for their country / device, (3) English. A country must never override a choice the
 * organizer made, so the choice lives here, separate from the draft (which is thrown away after
 * each created ride) and is consulted first by the entry screen and by every new or restored
 * draft. Storage failures just mean "no explicit choice".
 */

import { defaultStudioLocale } from "./draft";
import type { StudioLocale } from "./types";

export const LOCALE_PREF_KEY = "podium.rideStudio.locale";

export function readLocalePref(storage: Storage | null = safeStorage()): StudioLocale | null {
  try {
    const v = storage?.getItem(LOCALE_PREF_KEY);
    return v === "en" || v === "he" ? v : null;
  } catch {
    return null;
  }
}

export function writeLocalePref(
  locale: StudioLocale,
  storage: Storage | null = safeStorage(),
): void {
  try {
    storage?.setItem(LOCALE_PREF_KEY, locale);
  } catch {
    /* blocked storage: the choice just lasts for this visit */
  }
}

/** Explicit choice, else the country / device default, else English. */
export function effectiveStudioLocale(
  country: string | null | undefined,
  storage: Storage | null = safeStorage(),
): StudioLocale {
  return readLocalePref(storage) ?? defaultStudioLocale(country);
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
