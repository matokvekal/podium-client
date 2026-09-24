// Words for the "Route weather" section, in the rider's language — same small per-feature
// dictionary pattern as wind-labels.ts (see that file: this app has no app-wide i18n).

import { type TaglineLanguage, taglineLanguage } from "./app-tagline";

export interface RouteWeatherLabels {
  title: string;
  refresh: string;
  updated: (age: string) => string;
  unavailable: string;
}

const EN: RouteWeatherLabels = {
  title: "Route weather",
  refresh: "Refresh",
  updated: (age) => `Updated ${age}`,
  unavailable: "Route forecast unavailable",
};

const HE: RouteWeatherLabels = {
  title: "מזג אוויר במסלול",
  refresh: "רענון",
  updated: (age) => `עודכן ${age}`,
  unavailable: "תחזית המסלול אינה זמינה",
};

const LABELS: Partial<Record<TaglineLanguage, RouteWeatherLabels>> = { en: EN, he: HE };

export function routeWeatherLanguage(country: string | null | undefined): TaglineLanguage {
  return taglineLanguage(country);
}

export function routeWeatherLabels(language: TaglineLanguage): RouteWeatherLabels {
  return LABELS[language] ?? EN;
}
