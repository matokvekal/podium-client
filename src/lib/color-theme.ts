export type ColorTheme = "day" | "dark";

const STORAGE_KEY = "elnino.color-theme";

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "day" || value === "dark";
}

export function getInitialColorTheme(): ColorTheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isColorTheme(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, disabled): fall through to media query.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "day";
}

export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.setAttribute("data-color-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: keep runtime-only preference.
  }
}
