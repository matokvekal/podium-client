// Which way a piece of user-written text should be laid out.
//
// Ride descriptions in this app are overwhelmingly Hebrew (the region dropdown is Hebrew —
// see regions.ts), but the app shell is `<html lang="en">` with no `dir`, so a Hebrew
// description renders left-aligned with its punctuation stranded on the wrong side.
//
// The rule is DOMINANT SCRIPT, not first-strong-character, which is what `dir="auto"` uses.
// First-strong gets a description like `"Strava: יציאה בשעה 06:00 מהמרכז..."` wrong — one
// Latin word at the front flips an otherwise Hebrew paragraph to LTR. Counting letters gets
// it right, and the cost is one pass over a string that is at most a few thousand chars.
//
// Display only. Nothing here is stored, sent, or allowed to change the description text.

/** Hebrew, Arabic, Syriac, Thaana, N'Ko, Arabic Supplement/Extended-A, and the presentation forms. */
const RTL_CHARS = /[֐-׿؀-ۿ܀-ݏݐ-ݿ߀-߿ࠀ-࡟ࢠ-ࣿיִ-﷿ﹰ-﻿]/g;

/** Latin + Latin-1 Supplement/Extended-A letters. Deliberately not \p{L}, which matches RTL too. */
const LTR_CHARS = /[A-Za-zÀ-ɏ]/g;

export type TextDirection = "rtl" | "ltr";

/**
 * Ties and text with no letters at all (a bare "06:00", digits, emoji, punctuation) resolve to
 * "ltr" — the app's own default, so a description that carries no directional signal looks
 * exactly as it always has rather than flipping on a coin toss.
 */
export function detectTextDirection(text: string): TextDirection {
  if (!text) return "ltr";
  const rtl = text.match(RTL_CHARS)?.length ?? 0;
  const ltr = text.match(LTR_CHARS)?.length ?? 0;
  return rtl > ltr ? "rtl" : "ltr";
}
