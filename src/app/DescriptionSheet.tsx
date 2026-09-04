/**
 * The full ride description, in a scrollable bottom sheet.
 *
 * The event page shows the first few lines inline; when the text is longer than that, "… more"
 * opens this so a rider can read the whole thing without the page growing under them. Same
 * portal + overlay + slide-up pattern as SafetySheet / CopyTrackSheet (Escape and the overlay
 * both close it, body scroll is locked while it is open).
 *
 * Pure presentation — the text is passed in, nothing is fetched or persisted.
 */

import { AlignLeft } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./DescriptionSheet.module.css";

export function DescriptionSheet({
  title = "About this ride",
  text,
  onClose,
}: {
  title?: string;
  text: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Lock the page behind the sheet so a scroll gesture in the sheet never drags the page.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${styles.sheetOpen}`} role="dialog" aria-label={title}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <AlignLeft aria-hidden="true" className={styles.headerIcon} />
            {title}
          </span>
          <button type="button" className="button button--quiet" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>{text}</p>
        </div>
      </div>
    </>,
    document.body,
  );
}
