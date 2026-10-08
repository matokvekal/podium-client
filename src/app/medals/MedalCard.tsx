// One Event Completion Medal card. The first time the card scrolls into view on a visit it
// CELEBRATES: a ~3.5s confetti burst inside the card plus a bright gold sweep across the medal,
// staggered by position so a screenful of medals pops one after another, not all at once.
// After that the medal keeps a slow, quiet shine. Reduced-motion riders get the card, no motion.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { detectTextDirection } from "../../lib/text-direction";
import { type EventMedal, formatMedalDate } from "../../lib/medal";
import { medalBackgroundVars } from "../../lib/medal-backgrounds";
import { Confetti } from "./Confetti";
import { MedalBadge } from "./MedalBadge";
import styles from "./Medals.module.css";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export const CELEBRATION_MS = 3600;

export const MedalCard = forwardRef<
  HTMLElement | null,
  {
    medal: EventMedal;
    /** Position on the page — staggers the celebration. */
    index?: number;
    /** Deep-linked from a Past Ride: glow and celebrate straight away. */
    highlighted?: boolean;
  }
>(function MedalCard({ medal, index = 0, highlighted = false }, ref) {
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  useImperativeHandle<HTMLElement | null, HTMLElement | null>(ref, () => cardRef.current, []);
  const [celebrating, setCelebrating] = useState(false);
  const playedRef = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const el = cardRef.current;
    if (!el) return;
    let start: ReturnType<typeof setTimeout> | undefined;
    let stop: ReturnType<typeof setTimeout> | undefined;
    const play = (delay: number) => {
      if (playedRef.current) return;
      playedRef.current = true;
      start = setTimeout(() => {
        setCelebrating(true);
        stop = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
      }, delay);
    };
    if (highlighted) {
      play(350);
    } else if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            observer.disconnect();
            play((index % 4) * 220);
          }
        },
        { threshold: 0.45 },
      );
      observer.observe(el);
      return () => {
        observer.disconnect();
        clearTimeout(start);
        clearTimeout(stop);
      };
    }
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [reduced, highlighted, index]);

  const dir = detectTextDirection(medal.medalText);
  const titleDir = detectTextDirection(medal.eventTitle);

  return (
    <article
      ref={cardRef}
      className={styles.medalCard}
      data-highlighted={highlighted || undefined}
      data-celebrating={celebrating || undefined}
      data-testid="medal-card"
      id={`medal-${medal.eventId}`}
      style={medalBackgroundVars(medal.medalColorId, medal.medalStyleId)}
      aria-label={`Event completion medal: ${medal.eventTitle}`}
    >
      {celebrating && <Confetti />}
      {!medal.seen && <span className={styles.newRibbon}>NEW</span>}
      <MedalBadge size={76} shine={!reduced} className={celebrating ? styles.medalPop : undefined} />
      <h3 className={styles.medalTitle} dir={titleDir}>
        {medal.eventTitle}
      </h3>
      <p className={styles.medalDate}>{formatMedalDate(medal.eventDate)}</p>
      <p className={styles.medalText} dir={dir}>
        {medal.medalText}
      </p>
      <p className={styles.medalLabel}>EVENT COMPLETION MEDAL</p>
      <p className={styles.medalAwarded}>Awarded {formatMedalDate(medal.awardedAt)}</p>
    </article>
  );
});
