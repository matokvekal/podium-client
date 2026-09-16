/** Tier name -> the gem colour it reads as, shared by every Statistics screen. Cosmetic only —
 *  the achievement names themselves are configurable server-side (achievements.ts) and may not
 *  match these exact five forever; this just needs SOME colour for whatever name comes back. */
const TIER_COLOR: Record<string, string> = {
  Stone: "#94a3b8",
  Onyx: "#475569",
  Emerald: "#10b981",
  Ruby: "#e11d48",
  Diamond: "#38bdf8",
};

export function tierColor(name: string | null | undefined): string {
  return (name && TIER_COLOR[name]) || "var(--accent-strong)";
}
