// Words for the wind strip, in the rider's language.
//
// This app has no app-wide i18n (see lib/app-tagline.ts: "this is not app-wide i18n and nothing
// else here is translated"). The existing mechanism is a small per-feature dictionary keyed by
// the language app-tagline resolves — country first, then device locale, then English — and this
// follows it exactly. Hebrew and English are written out; the other tagline languages fall back
// to English rather than shipping machine guesses in a safety-adjacent readout.

import { type TaglineLanguage, taglineLanguage } from "./app-tagline";
import type { WindStrength } from "./wind-model";

export interface WindLabels {
  /** Row label for the gust row (only drawn when some hour has a significant gust). */
  gust: string;
  /** Printed ONCE, at the left of the speed row — "km/h" in every language. */
  unit: string;
  from: string;
  strength: Record<WindStrength, string>;
}

const EN: WindLabels = {
  gust: "gust",
  unit: "km/h",
  from: "from",
  strength: { light: "Light", moderate: "Moderate", strong: "Strong", veryStrong: "Very strong" },
};

const HE: WindLabels = {
  gust: "משבים",
  unit: "km/h",
  from: "מכיוון",
  strength: { light: "קלה", moderate: "בינונית", strong: "חזקה", veryStrong: "חזקה מאוד" },
};

const LABELS: Partial<Record<TaglineLanguage, WindLabels>> = { en: EN, he: HE };

export function windLanguage(country: string | null | undefined): TaglineLanguage {
  return taglineLanguage(country);
}

export function windLabels(language: TaglineLanguage): WindLabels {
  return LABELS[language] ?? EN;
}
