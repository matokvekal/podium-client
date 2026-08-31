export type ColorTheme = "day" | "dark";

const STORAGE_KEY = "elnino.color-theme";

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "day" || value === "dark";
}

/**
 * A rider's own choice always wins. With no choice on record the app opens in DAY, deliberately
 * ignoring prefers-color-scheme.
 *
 * That media query answers "how does this person like their operating system", and on a phone
 * it is very often dark — which meant a stranger opening an organizer's invitation link met a
 * dark app on their first ever look at it, having asked for nothing of the kind. This app is
 * for riding outdoors in daylight, its photography and maps are built for the light palette,
 * and it is the look every screenshot and mockup was designed against. The toggle in the header
 * is one tap away and is remembered from then on, so anyone who wants dark gets it and keeps it.
 */
export function getInitialColorTheme(): ColorTheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isColorTheme(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, disabled): fall through to the default below.
  }

  return "day";
}

export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.setAttribute("data-color-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: keep runtime-only preference.
  }
}
