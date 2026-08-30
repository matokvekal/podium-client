/**
 * Safety checklist — a small informational bottom sheet with the basic pre-ride kit every
 * rider should have. Opened from a plain "Safety checklist" link on the create form and on the
 * event detail page (organizers set it up, riders read it before joining).
 *
 * Pure static content — no props beyond `onClose`, no server call, nothing persisted. It is
 * deliberately not a form field: it must not disturb the create UI, it is just there to read.
 *
 * Same bottom-sheet pattern as CopyTrackSheet (portal + overlay + slide-up panel, Escape to
 * close).
 */

import { Droplets, Glasses, Hand, HardHat, LifeBuoy, Lightbulb, Wrench } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./SafetySheet.module.css";

const CHECKLIST: { icon: typeof HardHat; label: string; note: string }[] = [
  { icon: HardHat, label: "Wear a helmet", note: "Every ride, no exceptions." },
  {
    icon: Lightbulb,
    label: "Front & rear lights",
    note: "Even in daylight — it's how drivers see you.",
  },
  { icon: Droplets, label: "Bring water", note: "At least one full bottle; two on a hot day." },
  {
    icon: Wrench,
    label: "Puncture kit & spare tubes",
    note: "Tubes, levers, a pump or CO₂, and a multitool.",
  },
  { icon: Glasses, label: "Riding sunglasses", note: "Grit, bugs, sun, wind." },
  {
    icon: Hand,
    label: "Wear gloves",
    note: "Grip in the wet, and they protect your hands in a fall.",
  },
];

export function SafetySheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <p className={styles.intro}>The basics for every ride — check before you roll out.</p>
          <ul className={styles.list}>
            {CHECKLIST.map(({ icon: Icon, label, note }) => (
              <li key={label} className={styles.item}>
                <Icon aria-hidden="true" className={styles.itemIcon} />
                <span className={styles.itemText}>
                  <span className={styles.itemLabel}>{label}</span>
                  <span className={styles.itemNote}>{note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>,
    document.body,
  );
}
