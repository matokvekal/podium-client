/**
 * Safety checklist — a small bottom sheet with the basic pre-ride kit every rider should have.
 * Opened from a plain "Safety checklist" link on the create form and on the event detail page.
 *
 * Two modes:
 *  - read-only (create form; the organizer, a non-rider or a signed-out viewer on a ride):
 *    just the list to read, no checkboxes.
 *  - checkable (a rider on their ride, via SafetyChecklistLink): pass `checked` + `onToggle`
 *    and every row becomes one big checkbox label. The caller owns and persists the state
 *    (lib/safety-checklist.ts) so its link can show the red/green status.
 *
 * Text runs carry dir="auto" (the app's convention, as in RideStopsSection): the row layout
 * mirrors with the page, while each string keeps its own direction and punctuation.
 *
 * Each item's icon has a tiny looping CSS animation (helmet bob, light blink, water drip...),
 * transform/opacity only and clipped to its round badge. A ticked row goes still and green;
 * prefers-reduced-motion switches every animation off.
 *
 * Same bottom-sheet pattern as CopyTrackSheet (portal + overlay + slide-up panel, Escape to
 * close).
 */

import {
  Check,
  Droplets,
  Glasses,
  Hand,
  HardHat,
  LifeBuoy,
  Lightbulb,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SAFETY_ITEM_IDS, type SafetyItemId } from "../lib/safety-checklist";
import styles from "./SafetySheet.module.css";

const ITEMS: Record<
  SafetyItemId,
  {
    icon: typeof HardHat;
    anim: "bob" | "blink" | "drip" | "twist" | "shine" | "wave";
    label: string;
    note: string;
  }
> = {
  helmet: { icon: HardHat, anim: "bob", label: "Helmet", note: "Every ride, no exceptions." },
  lights: {
    icon: Lightbulb,
    anim: "blink",
    label: "Front & rear lights",
    note: "Even in daylight — it's how drivers see you.",
  },
  water: {
    icon: Droplets,
    anim: "drip",
    label: "Water",
    note: "At least one full bottle; two on a hot day.",
  },
  tools: {
    icon: Wrench,
    anim: "twist",
    label: "Repair kit",
    note: "Spare tube, levers, pump or CO₂, multitool.",
  },
  glasses: { icon: Glasses, anim: "shine", label: "Sunglasses", note: "Grit, bugs, sun, wind." },
  gloves: {
    icon: Hand,
    anim: "wave",
    label: "Gloves",
    note: "Grip in the wet, and they protect your hands in a fall.",
  },
};

export function SafetySheet({
  onClose,
  checked,
  onToggle,
}: {
  onClose: () => void;
  /** Checkable mode: the ticked item ids. Omit for the read-only list. */
  checked?: ReadonlySet<SafetyItemId>;
  onToggle?: (id: SafetyItemId) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const checkable = checked != null && onToggle != null;
  const total = SAFETY_ITEM_IDS.length;
  const done = checkable ? SAFETY_ITEM_IDS.filter((id) => checked.has(id)).length : 0;
  const allDone = checkable && done === total;

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        className={`${styles.sheet} ${styles.sheetOpen}`}
        role="dialog"
        aria-label="Cycling safety checklist"
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <LifeBuoy aria-hidden="true" className={styles.headerIcon} />
            Safety checklist
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className={styles.body}>
          {checkable ? (
            <div className={styles.progress} data-done={allDone || undefined}>
              <div className={styles.progressRow}>
                <span className={styles.progressLabel} aria-live="polite">
                  {allDone && <ShieldCheck aria-hidden="true" className={styles.progressIcon} />}
                  <span dir="auto">
                    {allDone ? `All ${total} ready — ride safe` : `${done} of ${total} ready`}
                  </span>
                </span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="Safety checklist progress"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-valuetext={`${done} of ${total} ready`}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${(done / total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className={styles.intro}>The basics for every ride — check before you roll out.</p>
          )}
          <ul className={styles.list}>
            {SAFETY_ITEM_IDS.map((id) => {
              const { icon: Icon, anim, label, note } = ITEMS[id];
              const isChecked = checkable && checked.has(id);
              const content = (
                <>
                  <span className={styles.iconBadge} data-anim={anim}>
                    <Icon aria-hidden="true" className={styles.itemIcon} />
                  </span>
                  <span className={styles.itemText}>
                    <span className={styles.itemLabel} dir="auto">
                      {label}
                    </span>
                    <span className={styles.itemNote} dir="auto">
                      {note}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={id} className={styles.item} data-checked={isChecked || undefined}>
                  {checkable ? (
                    <label className={styles.itemCheckable}>
                      {content}
                      <input
                        type="checkbox"
                        className={styles.checkInput}
                        checked={isChecked}
                        onChange={() => onToggle(id)}
                      />
                      <span className={styles.checkBox} aria-hidden="true">
                        <Check className={styles.checkMark} strokeWidth={3} />
                      </span>
                    </label>
                  ) : (
                    <div className={styles.itemStatic}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>,
    document.body,
  );
}
