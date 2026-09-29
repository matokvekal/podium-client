/**
 * An organizer's display name that wraps instead of overflowing.
 *
 * Same collapse/expand pattern as RideDescription (clamped in CSS, "clipped" MEASURED with
 * scrollHeight > clientHeight, "Show more"/"Show less" toggle) — deliberately not a second UX.
 * Direction is by dominant script (lib/text-direction.ts) and display-only; the name is never
 * altered. `toggle={false}` is for surfaces that are themselves links or sit over a photo (the
 * event tile and hero): they get the wrap + line clamp, and the full name is one tap away in the
 * event page's organizer card.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { detectTextDirection } from "../lib/text-direction";
import styles from "./ExpandableName.module.css";

export function ExpandableName({
  text,
  lines = 2,
  toggle = true,
  className,
}: {
  text: string;
  lines?: number;
  toggle?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

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
    <span className={styles.wrap}>
      <span
        className={`${styles.text} ${className ?? ""}`}
        data-expanded={expanded ? "true" : undefined}
        dir={detectTextDirection(text)}
        ref={textRef}
        style={{ WebkitLineClamp: lines, lineClamp: lines }}
      >
        {text}
      </span>
      {toggle && (clipped || expanded) && (
        <button
          aria-expanded={expanded}
          className={styles.toggle}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}
