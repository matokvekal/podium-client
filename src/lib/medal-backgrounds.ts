// Medal backgrounds — the organizer picks ONE of 20 colours and ONE of 10 styles (200
// combinations) for the medal every rider of their ride receives. Stored as two short ids, never
// as an image: the card is drawn from these tables on every device.
//
// READABILITY IS BUILT IN, NOT CHECKED AFTERWARDS. Every colour carries its own ink (text),
// muted ink and label colours, chosen for that colour's tone; every style is a low-contrast
// overlay (white/black at ≤ 12% alpha) that never changes the tone underneath. So any colour ×
// any style keeps the gold medal and the text legible.
//
// DEFAULT = TODAY'S MEDAL. "classic" + "glow" reproduces the original card exactly (the app's
// surface colour with a soft gold glow from the top), and an id that is missing or unknown — every
// medal awarded before this existed, or an id from a newer app — falls back to it.

import type { CSSProperties } from "react";

export interface MedalColor {
  id: string;
  name: string;
  /** Card base. */
  base: string;
  /** The glow / highlight tint the styles draw with. */
  glow: string;
  border: string;
  ink: string;
  muted: string;
  label: string;
  tone: "light" | "dark";
}

export interface MedalStyle {
  id: string;
  name: string;
  /** CSS background layers drawn OVER the base colour. `var(--medal-glow)` is the colour's glow. */
  layers: string;
}

const LIGHT = { ink: "#1b1e26", muted: "#5b6270", label: "#9a6512", tone: "light" as const };
const DARK = { ink: "#fff8e6", muted: "rgba(255, 248, 230, 0.74)", label: "#f7c948", tone: "dark" as const };

export const DEFAULT_MEDAL_COLOR = "classic";
export const DEFAULT_MEDAL_STYLE = "glow";

export const MEDAL_COLORS: readonly MedalColor[] = [
  // The original card: follows the app theme (light or dark), so it uses the theme's own text.
  {
    id: "classic",
    name: "Classic",
    base: "var(--surface)",
    glow: "rgba(247, 201, 72, 0.22)",
    border: "rgba(214, 158, 30, 0.45)",
    ink: "var(--text)",
    muted: "var(--text-muted)",
    label: "#b7791f",
    tone: "light",
  },
  { id: "champagne", name: "Champagne", base: "#f7eedc", glow: "rgba(247, 201, 72, 0.32)", border: "#e6cf9c", ...LIGHT },
  { id: "pearl", name: "Pearl", base: "#f5f4f0", glow: "rgba(255, 255, 255, 0.9)", border: "#dcd8cf", ...LIGHT },
  { id: "blush", name: "Blush", base: "#f7e4e1", glow: "rgba(255, 214, 205, 0.7)", border: "#e8c3bc", ...LIGHT },
  { id: "peach", name: "Peach", base: "#fbe6d4", glow: "rgba(255, 196, 140, 0.45)", border: "#efc9a6", ...LIGHT },
  { id: "sand", name: "Sand", base: "#efe4d1", glow: "rgba(222, 190, 130, 0.45)", border: "#d9c6a3", ...LIGHT },
  { id: "sage", name: "Sage", base: "#e2ece2", glow: "rgba(180, 214, 180, 0.55)", border: "#bfd3bf", ...LIGHT },
  { id: "mint", name: "Mint", base: "#dcf1e9", glow: "rgba(150, 224, 196, 0.5)", border: "#b5dccd", ...LIGHT },
  { id: "sky", name: "Sky", base: "#e0ebf7", glow: "rgba(160, 200, 245, 0.55)", border: "#bcd0e8", ...LIGHT },
  { id: "lavender", name: "Lavender", base: "#ebe5f5", glow: "rgba(196, 176, 240, 0.5)", border: "#cfc3e6", ...LIGHT },
  { id: "navy", name: "Navy", base: "#14213d", glow: "rgba(247, 201, 72, 0.22)", border: "#2c3e66", ...DARK },
  { id: "midnight", name: "Midnight", base: "#0b1020", glow: "rgba(120, 150, 255, 0.22)", border: "#232b45", ...DARK },
  { id: "royal", name: "Royal Blue", base: "#1d2f6f", glow: "rgba(255, 220, 120, 0.22)", border: "#34478f", ...DARK },
  { id: "teal", name: "Deep Teal", base: "#0e3b43", glow: "rgba(110, 220, 210, 0.2)", border: "#21555e", ...DARK },
  { id: "emerald", name: "Emerald", base: "#0f3d2e", glow: "rgba(120, 230, 170, 0.2)", border: "#22584a", ...DARK },
  { id: "forest", name: "Forest", base: "#1f3a2a", glow: "rgba(200, 230, 150, 0.18)", border: "#36553f", ...DARK },
  { id: "burgundy", name: "Burgundy", base: "#4a1426", glow: "rgba(255, 170, 170, 0.2)", border: "#6a2a40", ...DARK },
  { id: "plum", name: "Plum", base: "#3a1d47", glow: "rgba(220, 170, 255, 0.2)", border: "#563366", ...DARK },
  { id: "bronze", name: "Bronze", base: "#3b2a1a", glow: "rgba(247, 201, 72, 0.25)", border: "#5a432b", ...DARK },
  { id: "charcoal", name: "Charcoal", base: "#23262b", glow: "rgba(255, 255, 255, 0.12)", border: "#3a3e45", ...DARK },
];

export const MEDAL_STYLES: readonly MedalStyle[] = [
  // The original: a soft glow from the top.
  { id: "glow", name: "Glow", layers: "radial-gradient(120% 70% at 50% 0%, var(--medal-glow), transparent 70%)" },
  { id: "solid", name: "Solid", layers: "linear-gradient(transparent, transparent)" },
  {
    id: "sunburst",
    name: "Sunburst",
    layers:
      "radial-gradient(70% 55% at 50% 28%, var(--medal-glow), transparent 75%), repeating-conic-gradient(from 0deg at 50% 26%, rgba(255,255,255,0.07) 0deg 6deg, transparent 6deg 15deg)",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    layers:
      "radial-gradient(60% 45% at 50% 24%, var(--medal-glow), transparent 80%), radial-gradient(140% 100% at 50% 40%, transparent 55%, rgba(0,0,0,0.10) 100%)",
  },
  {
    id: "silk",
    name: "Silk",
    layers:
      "linear-gradient(125deg, transparent 20%, rgba(255,255,255,0.12) 38%, transparent 50%, rgba(255,255,255,0.08) 66%, transparent 80%), radial-gradient(120% 60% at 50% 0%, var(--medal-glow), transparent 70%)",
  },
  {
    id: "linen",
    name: "Linen",
    layers:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.035) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 4px), radial-gradient(120% 70% at 50% 0%, var(--medal-glow), transparent 70%)",
  },
  {
    id: "pinstripe",
    name: "Pinstripe",
    layers:
      "repeating-linear-gradient(135deg, rgba(255,255,255,0.09) 0 2px, transparent 2px 14px), radial-gradient(120% 70% at 50% 0%, var(--medal-glow), transparent 70%)",
  },
  {
    id: "dots",
    name: "Dots",
    layers:
      "radial-gradient(rgba(255,255,255,0.14) 1.2px, transparent 1.6px) 0 0 / 14px 14px, radial-gradient(120% 70% at 50% 0%, var(--medal-glow), transparent 70%)",
  },
  {
    id: "argyle",
    name: "Argyle",
    layers:
      "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25% 75%, rgba(255,255,255,0.06) 75%) 0 0 / 28px 28px, linear-gradient(-45deg, rgba(0,0,0,0.04) 25%, transparent 25% 75%, rgba(0,0,0,0.04) 75%) 0 0 / 28px 28px, radial-gradient(120% 70% at 50% 0%, var(--medal-glow), transparent 70%)",
  },
  {
    id: "ripple",
    name: "Ripple",
    layers:
      "repeating-radial-gradient(circle at 50% 26%, rgba(255,255,255,0.08) 0 2px, transparent 2px 18px), radial-gradient(80% 55% at 50% 26%, var(--medal-glow), transparent 75%)",
  },
];

const COLOR_BY_ID = new Map(MEDAL_COLORS.map((c) => [c.id, c]));
const STYLE_BY_ID = new Map(MEDAL_STYLES.map((s) => [s.id, s]));

export function medalColor(id: string | null | undefined): MedalColor {
  return COLOR_BY_ID.get(id ?? "") ?? (COLOR_BY_ID.get(DEFAULT_MEDAL_COLOR) as MedalColor);
}

export function medalStyle(id: string | null | undefined): MedalStyle {
  return STYLE_BY_ID.get(id ?? "") ?? (STYLE_BY_ID.get(DEFAULT_MEDAL_STYLE) as MedalStyle);
}

/** The CSS custom properties a medal card / reveal reads (Medals.module.css). */
export function medalBackgroundVars(
  colorId: string | null | undefined,
  styleId: string | null | undefined,
): CSSProperties {
  const color = medalColor(colorId);
  const style = medalStyle(styleId);
  return {
    "--medal-base": color.base,
    "--medal-glow": color.glow,
    "--medal-layers": style.layers,
    "--medal-border": color.border,
    "--medal-ink": color.ink,
    "--medal-muted": color.muted,
    "--medal-label": color.label,
  } as CSSProperties;
}
