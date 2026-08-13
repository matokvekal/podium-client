// The two visual styles, standard and competition.
//
// PRESENTATION ONLY. A display mode changes spacing, weight and how loudly status is
// shown — never data, permissions or lifecycle. An event carries its own mode
// (events.display_mode), so opening a race switches the interface and leaving it switches
// back.

export type DisplayMode = "standard" | "competition";

export const DEFAULT_DISPLAY_MODE: DisplayMode = "standard";

/** Applies a mode to the document. The tokens in styles/tokens.css do the rest. */
export function applyDisplayMode(mode: DisplayMode): void {
  document.documentElement.dataset.displayMode = mode;
}

export function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "standard" || value === "competition";
}
