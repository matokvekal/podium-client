/**
 * The progress battery: one rounded segment per meaningful question, filled green as each is
 * genuinely answered. It supplements the three phase tabs (The idea / Route & details / Review &
 * share) rather than replacing them, and it is the only fill-as-you-go indicator on screen.
 *
 * The count and the fills come from engine/progress.ts (the real flow, valid answers only). Here
 * we only decide what to ANIMATE: a segment that is filled on the very first paint — a draft
 * restored from this device — appears already full, and only a segment that becomes filled while
 * the rider is looking fills with a short sweep and one soft glow. No loops, no confetti; with
 * reduced motion the fill is instant and nothing glows.
 */

import { useEffect, useRef, useState } from "react";
import { messageTier, progressSegments, progressSummary } from "../engine/progress";
import type { RideDraft } from "../engine/types";
import { localeDir, type StudioKey, t } from "../i18n";
import styles from "./studio.module.css";

const CELEBRATE_MS = 1300;

export function ProgressBattery({
  draft,
  allDone = false,
}: {
  draft: RideDraft;
  /** The ride exists: show the whole battery full (the draft itself has been reset by then). */
  allDone?: boolean;
}) {
  const { locale } = draft;
  const real = progressSegments(draft);
  const segments = allDone ? real.map((s) => ({ ...s, done: true })) : real;
  const { done, total, complete } = progressSummary(segments);
  const doneKey = segments
    .filter((s) => s.done)
    .map((s) => s.questionId)
    .join("|");

  const previous = useRef<string[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    const now = doneKey ? doneKey.split("|") : [];
    const before = previous.current;
    previous.current = now;
    if (before === null) return; // first paint: restored progress is shown, not celebrated
    const added = now.filter((id) => !before.includes(id));
    setFresh(added);
    if (added.length === 0) return;
    const timer = window.setTimeout(() => setFresh([]), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [doneKey]);

  const message = complete
    ? t(locale, "progress.msgDone")
    : t(locale, `progress.msg${messageTier(done, total)}` as StudioKey);

  return (
    <div className={styles.battery} data-dir={localeDir(locale)} data-complete={complete}>
      <div
        className={styles.batteryBar}
        role="progressbar"
        aria-label={t(locale, "progress.label")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={t(locale, "progress.value", { done, total })}
      >
        {segments.map((s) => (
          <span
            key={s.questionId}
            className={styles.batterySeg}
            data-done={s.done}
            data-fresh={fresh.includes(s.questionId) || undefined}
            data-segment={s.questionId}
          >
            <span className={styles.batteryFill} />
          </span>
        ))}
      </div>
      <p className={styles.batteryMsg} aria-live="polite">
        {complete ? <span aria-hidden="true">✓ </span> : null}
        {message}
      </p>
    </div>
  );
}
