// A short CSS-only confetti burst — no library, no canvas. Each piece's colour, drift, spin and
// delay come from its index (deterministic, so tests and re-renders are stable). The parent must
// be `position: relative; overflow: hidden` to keep the burst inside it. Callers skip rendering it
// entirely under prefers-reduced-motion (see usePrefersReducedMotion).

import type { CSSProperties } from "react";
import styles from "./Medals.module.css";

const COLORS = ["#F7C948", "#FFE58A", "#1E5BD8", "#E0413A", "#2BB673", "#FF8A3D", "#B57BFF"];

export function Confetti({ pieces = 22, durationMs = 3400 }: { pieces?: number; durationMs?: number }) {
  return (
    <span className={styles.confetti} aria-hidden="true" data-testid="confetti">
      {Array.from({ length: pieces }, (_, i) => {
        // Spread across the width with a little jitter; alternate drift direction.
        const left = ((i * 37) % 100) + ((i * 13) % 7) - 3;
        const drift = ((i % 2 === 0 ? 1 : -1) * (12 + ((i * 17) % 40))).toFixed(0);
        const spin = (360 + ((i * 97) % 540)).toFixed(0);
        const delay = ((i * 53) % 700).toFixed(0);
        const fall = durationMs - 700 + ((i * 29) % 600);
        const style = {
          left: `${left}%`,
          background: COLORS[i % COLORS.length],
          "--drift": `${drift}px`,
          "--spin": `${spin}deg`,
          animationDelay: `${delay}ms`,
          animationDuration: `${fall}ms`,
          width: i % 3 === 0 ? 6 : 8,
          height: i % 3 === 0 ? 10 : 5,
          borderRadius: i % 4 === 0 ? "50%" : 1,
        } as CSSProperties;
        return <span key={i} className={styles.confettiPiece} style={style} />;
      })}
    </span>
  );
}
