export type ColorTheme = "day" | "dark";

/**
 * Deliberately v2.
 *
 * The previous key ("elnino.color-theme") is unreadable as a preference, because the old
 * applyColorTheme persisted on EVERY call — including the one that merely applied a default
 * derived from `prefers-color-scheme`. So a rider who opened the app once on a dark phone, and
 * never touched the toggle, has "dark" sitting in storage that looks exactly like a choice they
 * made. Defaulting to day was therefore invisible to every existing device: the stale value won.
 *
 * A new key throws those away and starts everyone at the documented default. From here only
 * saveColorTheme writes, and only the toggle calls it, so anything found under v2 really was
 * chosen by the person using the app.
 */
const STORAGE_KEY = "elnino.color-theme.v2";

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "day" || value === "dark";
}

/**
 * A rider's own choice always wins. With no choice on record the app opens in DAY, deliberately
 * ignoring prefers-color-scheme.
 *
 * That media query answers "how does this person like their operating system", and on a phone it
 * is very often dark — which meant a stranger opening an organizer's invitation link met a dark
 * app on their first ever look at it, having asked for nothing of the kind. This app is for
 * riding outdoors in daylight, its photography and maps are built for the light palette, and it
 * is the look every screenshot and mockup was designed against. The toggle in the header is one
 * tap away and is remembered from then on, so anyone who wants dark gets it and keeps it.
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

/**
 * Paint the theme. Does NOT persist — see saveColorTheme.
 *
 * Keeping these apart is the whole fix: applying a default and choosing a theme are different
 * events, and only the second is a preference worth remembering.
 */
export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.setAttribute("data-color-theme", theme);
}

/** Remember a theme the rider actually picked. Only the header toggle calls this. */
export function saveColorTheme(theme: ColorTheme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies for this session, just isn't remembered.
  }
}
