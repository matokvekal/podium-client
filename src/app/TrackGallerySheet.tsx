/**
 * The create form's track picker: the shared track browser in a full-screen modal.
 *
 * WHY IT EXISTS. Picking the track is the step that decides whether a ride happens, and most
 * riders cannot produce a Garmin GPX file. For them the only usable path is reusing somebody
 * else's track, and until now that path was a bottom sheet listing ride NAMES with a
 * "Loading route…" line under each — a file dialog, essentially. Choosing a route is a visual
 * decision: the shape of the line, how far, how much climbing, how long.
 *
 * The upload path is not replaced or hidden; it sits beside this on the create form, which is
 * where it belongs, since it is a different intention rather than a lesser one.
 *
 * WHAT IS LEFT IN THIS FILE. The browser itself — toolbar, filters, sort, grid, paging — moved
 * to TrackGalleryBrowser, because the standalone Find Tracks page (/findtracks) is the same product
 * and must not drift from it. What remains here is only what a MODAL needs and a page does not:
 * the portal, the dimmed overlay, and the body scroll lock. Escape, focus and the close button
 * belong to the browser, which knows whether a filter panel is open and should close first.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { EventSummary } from "../lib/local-db";
import type { SurfaceType } from "../lib/surface-types";
import { TrackGalleryBrowser } from "./TrackGalleryBrowser";
import styles from "./TrackGallerySheet.module.css";

interface TrackGallerySheetProps {
  onPick: (event: EventSummary) => void;
  onClose: () => void;
  /** The ride's discipline — the gallery opens filtered to it. */
  initialSurface?: SurfaceType;
}

export function TrackGallerySheet({ onPick, onClose, initialSurface }: TrackGallerySheetProps) {
  // Body scroll lock. This is the app's first full-screen modal — the bottom sheets are short
  // enough that the page scrolling behind them is merely untidy. Here the modal owns the whole
  // viewport and its own scroller, so without this a flick past the end scrolls the create form
  // underneath and the rider loses their place in the gallery.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Choose a track">
        <TrackGalleryBrowser
          variant="modal"
          onPick={onPick}
          onClose={onClose}
          initialSurface={initialSurface}
        />
      </div>
    </>,
    document.body,
  );
}
