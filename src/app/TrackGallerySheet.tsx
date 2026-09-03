/**
 * The track gallery — a full-screen browser of tracks that riders have actually ridden.
 *
 * WHY IT EXISTS. Picking the track is the step that decides whether a ride happens, and most
 * riders cannot produce a Garmin GPX file. For them the only usable path is reusing somebody
 * else's track, and until now that path was a bottom sheet listing ride NAMES with a
 * "Loading route…" line under each — a file dialog, essentially. Choosing a route is a visual
 * decision: the shape of the line, how far, how much climbing, how long. This shows those.
 *
 * The upload path is not replaced or hidden; it sits beside this on the create form, which is
 * where it belongs, since it is a different intention rather than a lesser one.
 *
 * SCALE IS THE CONSTRAINT that shaped this file. The grid has to stay cheap with thousands of
 * rows, so: the list pages against the server's own limit/offset (useTrackGallery), the
 * thumbnails are inline SVG rather than Leaflet maps (track-thumbnail.ts), and geometry is
 * fetched per card only once that card is near the viewport.
 *
 * Sort and filter are deliberately out of scope for now beyond the source toggle and a search
 * box — asked for directly. The paging and the card are built so adding them later is a change
 * to the query string, not to this component's shape.
 */

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EventSummary } from "../lib/local-db";
import { TrackGalleryCard } from "./TrackGalleryCard";
import styles from "./TrackGallerySheet.module.css";
import { type GallerySource, useTrackGallery } from "./useTrackGallery";

interface TrackGallerySheetProps {
  onPick: (event: EventSummary) => void;
  onClose: () => void;
}

export function TrackGallerySheet({ onPick, onClose }: TrackGallerySheetProps) {
  const [source, setSource] = useState<GallerySource>("all");
  const [search, setSearch] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { rides, total, loading, loadingMore, error, hasMore, loadMore, requestRoute, routes } =
    useTrackGallery(source, search);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // Focus starts on Close: a keyboard or screen-reader user lands on the way out, not partway
  // down a list of hundreds of cards.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Page in the next batch as the sentinel comes into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  function switchSource(next: GallerySource) {
    setSource(next);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Choose a track">
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Choose a track</h2>
            <p className={styles.subtitle}>
              {loading
                ? "Finding tracks…"
                : `${total} ${total === 1 ? "ride" : "rides"} you can start from`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.controls}>
          <div className={styles.sourceToggle}>
            <button
              type="button"
              className={source === "all" ? "button" : "button button--quiet"}
              onClick={() => switchSource("all")}
              aria-pressed={source === "all"}
            >
              All rides
            </button>
            <button
              type="button"
              className={source === "mine" ? "button" : "button button--quiet"}
              onClick={() => switchSource("mine")}
              aria-pressed={source === "mine"}
            >
              My rides
            </button>
          </div>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input
              className={styles.search}
              placeholder="Search by name or place…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tracks"
            />
          </div>
        </div>

        <div className={styles.scroller} ref={scrollRef}>
          {error && (
            <p className="banner banner--error" role="alert">
              {error}
            </p>
          )}

          {loading && rides.length === 0 ? (
            <div className={styles.centered}>
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading tracks…</span>
            </div>
          ) : rides.length === 0 ? (
            <p className={`muted ${styles.centered}`}>
              {search.trim()
                ? "No tracks match that search."
                : source === "mine"
                  ? "None of your rides has a track yet."
                  : "No tracks to show yet."}
            </p>
          ) : (
            <div className={`card-grid ${styles.grid}`}>
              {rides.map((event) => (
                <TrackGalleryCard
                  key={event.id}
                  event={event}
                  route={routes.get(event.id)}
                  usedByRides={routes.get(event.id)?.usedByRides}
                  onVisible={requestRoute}
                  onPick={onPick}
                />
              ))}
            </div>
          )}

          {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}

          {loadingMore && (
            <div className={styles.centered}>
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading more…</span>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
