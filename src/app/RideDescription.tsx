/**
 * The ride's description, as a section of the event page rather than loose body copy.
 *
 * Collapsed to a few lines by default and expanded IN PLACE — this replaces DescriptionSheet,
 * which pushed the full text into a bottom sheet. A description is page content, not an action,
 * and sending a rider to a modal to read four more lines of it was the wrong weight.
 *
 * Two things here are less obvious than they look:
 *
 * 1. WHETHER THE TEXT IS ACTUALLY CUT OFF IS MEASURED, NOT GUESSED. The old code clamped to 4
 *    lines in CSS but decided whether to draw "Read more" from a 140-CHARACTER threshold, so the
 *    two disagreed in both directions: a short description with six hard newlines was visibly
 *    truncated with no way to open it, and a long unbroken line on a wide screen offered a
 *    button that revealed nothing. scrollHeight > clientHeight asks the browser the question the
 *    button is actually about.
 *
 * 2. DIRECTION IS BY DOMINANT SCRIPT (lib/text-direction.ts), not `dir="auto"`. See that file.
 *    It is display-only and never touches the stored text.
 *
 * Callers key this on the description itself, so a ride whose text changes under an expanded
 * card comes back collapsed and freshly measured rather than keeping the previous text's state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { detectTextDirection } from "../lib/text-direction";
import styles from "./RideDescription.module.css";

export function RideDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const direction = detectTextDirection(text);

  // Only meaningful while collapsed: once expanded the clamp is off and scrollHeight always
  // equals clientHeight, which would answer "no overflow" and hide the control that collapses
  // it again. Re-measured on resize because the answer depends on the width the text is in —
  // a rotation or a desktop window drag genuinely changes it.
  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    measure();
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <section className={styles.card} aria-labelledby="ride-description-heading">
      <h2 className={styles.heading} id="ride-description-heading">
        Description
      </h2>
      <p
        className={styles.text}
        data-expanded={expanded ? "true" : undefined}
        dir={direction}
        ref={textRef}
      >
        {text}
      </p>
      {(clipped || expanded) && (
        <button
          aria-expanded={expanded}
          className={styles.toggle}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
