/**
 * Safety checklist — a small informational bottom sheet with the basic pre-ride kit every
 * rider should have. Opened from a plain "Safety checklist" link on the create form and on the
 * event detail page (organizers set it up, riders read it before joining).
 *
 * Each item has a checkbox — the rider's own "I have it" tick. The ticks live in the caller's
 * `useSafetyChecks` (kept per ride on this device on the ride page, in memory on the create
 * form); nothing goes to the server. The ride page turns its link green once all are ticked.
 * It is deliberately not a form field: it must not disturb the create UI.
 *
 * Same bottom-sheet pattern as CopyTrackSheet (portal + overlay + slide-up panel, Escape to
 * close).
 */

import { Droplets, Glasses, Hand, HardHat, LifeBuoy, Lightbulb, Wrench } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SafetyItemId } from "../lib/safety-checklist";
import styles from "./SafetySheet.module.css";
import type { SafetyChecks } from "./useSafetyChecks";

const CHECKLIST: { id: SafetyItemId; icon: typeof HardHat; label: string; note: string }[] = [
  { id: "helmet", icon: HardHat, label: "Wear a helmet", note: "Every ride, no exceptions." },
  {
    id: "lights",
    icon: Lightbulb,
    label: "Front & rear lights",
    note: "Even in daylight — it's how drivers see you.",
  },
  {
    id: "water",
    icon: Droplets,
    label: "Bring water",
    note: "At least one full bottle; two on a hot day.",
  },
  {
    id: "puncture",
    icon: Wrench,
    label: "Puncture kit & spare tubes",
    note: "Tubes, levers, a pump or CO₂, and a multitool.",
  },
  { id: "sunglasses", icon: Glasses, label: "Riding sunglasses", note: "Grit, bugs, sun, wind." },
  {
    id: "gloves",
    icon: Hand,
    label: "Wear gloves",
    note: "Grip in the wet, and they protect your hands in a fall.",
  },
];

export function SafetySheet({ onClose, checks }: { onClose: () => void; checks: SafetyChecks }) {
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
            {CHECKLIST.map(({ id, icon: Icon, label, note }) => (
              <li key={id} className={styles.item}>
                {/* The whole row is the label, so the tap target is the row, not just the box. */}
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={checks.checked.includes(id)}
                    onChange={() => checks.toggle(id)}
                  />
                  <Icon aria-hidden="true" className={styles.itemIcon} />
                  <span className={styles.itemText}>
                    <span className={styles.itemLabel}>{label}</span>
                    <span className={styles.itemNote}>{note}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>,
    document.body,
  );
}
