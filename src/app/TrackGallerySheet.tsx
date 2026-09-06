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
 * SEARCH / FILTER / SORT are server-backed (lib/track-gallery-filter.ts builds the query
 * string; the filter choices persist in store/trackGalleryFiltersStore.ts). The filter and
 * sort panels are bottom sheets on a phone and a floating panel on a wide screen — same
 * markup, a CSS media query switches the layout.
 */

import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EventSummary } from "../lib/local-db";
import { DURATION_BUCKETS } from "../lib/ride-duration";
import { LEVELS } from "../lib/rider-level";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL, type SurfaceType } from "../lib/surface-types";
import {
  TRACK_SORT_LABEL,
  type TrackGalleryCriteria,
  type TrackGallerySort,
  trackGalleryActiveFilterCount,
} from "../lib/track-gallery-filter";
import { CLIMB_MAX, CLIMB_MIN, DISTANCE_MAX, DISTANCE_MIN } from "../lib/track-types";
import { useTrackGalleryFiltersStore } from "../store/trackGalleryFiltersStore";
import { RangeSlider } from "./RangeSlider";
import { TrackGalleryCard } from "./TrackGalleryCard";
import styles from "./TrackGallerySheet.module.css";
import { type GallerySource, useTrackGallery } from "./useTrackGallery";

interface TrackGallerySheetProps {
  onPick: (event: EventSummary) => void;
  onClose: () => void;
}

/** Add or remove one value from a multi-select list. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TrackGallerySheet({ onPick, onClose }: TrackGallerySheetProps) {
  const [source, setSource] = useState<GallerySource>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const criteria = useTrackGalleryFiltersStore((s) => s.criteria);
  const sort = useTrackGalleryFiltersStore((s) => s.sort);
  const setCriteria = useTrackGalleryFiltersStore((s) => s.setCriteria);
  const setSort = useTrackGalleryFiltersStore((s) => s.setSort);
  const clearFilters = useTrackGalleryFiltersStore((s) => s.clearFilters);
  const activeCount = trackGalleryActiveFilterCount(criteria);

  const {
    rides,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    requestRoute,
    routes,
    areas,
  } = useTrackGallery(source, search, criteria, sort);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Close whichever panel is open before closing the whole gallery.
      if (sortOpen) {
        setSortOpen(false);
        return;
      }
      if (filterOpen) {
        setFilterOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, filterOpen, sortOpen]);

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

  function patch(next: Partial<TrackGalleryCriteria>) {
    setCriteria(next);
  }

  const showCount = loading ? "…" : String(total);
  const activeChips = buildActiveChips(criteria, patch);

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
              placeholder="Search by name, place or ride code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tracks"
            />
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              setSortOpen(false);
              setFilterOpen(true);
            }}
            aria-label="Filter tracks"
          >
            <SlidersHorizontal className={styles.iconGlyph} aria-hidden="true" />
            <span>Filter</span>
            {activeCount > 0 && <span className={styles.iconCount}>{activeCount}</span>}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              setFilterOpen(false);
              setSortOpen(true);
            }}
            aria-label="Sort tracks"
          >
            <ArrowUpDown className={styles.iconGlyph} aria-hidden="true" />
            <span>Sort</span>
          </button>
        </div>

        {activeChips.length > 0 && (
          <div className={styles.activeFilters}>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.activeFilterChip}
                onClick={chip.clear}
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X width={12} height={12} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className={styles.clearFiltersBtn} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}

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
              {search.trim() || activeCount > 0
                ? "No tracks match those filters."
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

        {(filterOpen || sortOpen) && (
          <div
            className={styles.panelOverlay}
            onClick={() => {
              setFilterOpen(false);
              setSortOpen(false);
            }}
            aria-hidden="true"
          />
        )}

        <div
          className={filterOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
          role="dialog"
          aria-modal="true"
          aria-label="Filter tracks"
        >
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Filter</h3>
            <button type="button" className="button button--quiet" onClick={clearFilters}>
              Clear
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setFilterOpen(false)}
              aria-label="Close filters"
            >
              <X width={18} height={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.panelBody}>
            {areas.length > 0 && (
              <FilterGroup label="Area">
                {areas.map((area) => (
                  <ChipButton
                    key={area}
                    on={criteria.areas.includes(area)}
                    onClick={() => patch({ areas: toggle(criteria.areas, area) })}
                  >
                    {area}
                  </ChipButton>
                ))}
              </FilterGroup>
            )}

            <FilterGroup label="Ride type">
              {(Object.keys(SURFACE_TYPE_LABEL) as SurfaceType[]).map((s) => {
                const Icon = SURFACE_TYPE_ICON[s];
                return (
                  <ChipButton
                    key={s}
                    on={criteria.surface.includes(s)}
                    onClick={() => patch({ surface: toggle(criteria.surface, s) })}
                  >
                    <Icon width={13} height={13} aria-hidden="true" />
                    {SURFACE_TYPE_LABEL[s]}
                  </ChipButton>
                );
              })}
            </FilterGroup>

            <FilterGroup label="Difficulty">
              {LEVELS.map((l) => (
                <ChipButton
                  key={l.value}
                  on={criteria.level.includes(l.value)}
                  onClick={() => patch({ level: toggle(criteria.level, l.value) })}
                >
                  {l.label}
                </ChipButton>
              ))}
            </FilterGroup>

            <div className={styles.panelGroup}>
              <RangeSlider
                label="Distance"
                min={DISTANCE_MIN}
                max={DISTANCE_MAX}
                step={5}
                unit="km"
                value={criteria.distanceKm}
                onChange={(v) => patch({ distanceKm: v })}
              />
            </div>
            <div className={styles.panelGroup}>
              <RangeSlider
                label="Climb"
                min={CLIMB_MIN}
                max={CLIMB_MAX}
                step={50}
                unit="m"
                value={criteria.climbM}
                onChange={(v) => patch({ climbM: v })}
              />
            </div>

            <FilterGroup label="Ride duration">
              {DURATION_BUCKETS.map((b) => (
                <ChipButton
                  key={b.key}
                  on={criteria.durationBuckets.includes(b.key)}
                  onClick={() =>
                    patch({ durationBuckets: toggle(criteria.durationBuckets, b.key) })
                  }
                >
                  {b.label}
                </ChipButton>
              ))}
            </FilterGroup>

            <button type="button" className="button" onClick={() => setFilterOpen(false)}>
              Show {showCount} {total === 1 ? "track" : "tracks"}
            </button>
          </div>
        </div>

        <div
          className={sortOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
          role="dialog"
          aria-modal="true"
          aria-label="Sort tracks"
        >
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Sort</h3>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setSortOpen(false)}
              aria-label="Close sort"
            >
              <X width={18} height={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.panelBody}>
            {(Object.keys(TRACK_SORT_LABEL) as TrackGallerySort[]).map((s) => (
              <button
                key={s}
                type="button"
                className={styles.sortOption}
                data-on={sort === s}
                onClick={() => {
                  setSort(s);
                  setSortOpen(false);
                }}
              >
                {TRACK_SORT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.panelGroup}>
      <span className={styles.panelGroupLabel}>{label}</span>
      <div className={styles.panelChips}>{children}</div>
    </div>
  );
}

function ChipButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.filterChip}
      data-on={on}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface ActiveChip {
  key: string;
  label: string;
  clear: () => void;
}

/** The removable chips under the toolbar — one per active filter value / range. */
function buildActiveChips(
  c: TrackGalleryCriteria,
  patch: (next: Partial<TrackGalleryCriteria>) => void,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const area of c.areas) {
    chips.push({
      key: `area:${area}`,
      label: area,
      clear: () => patch({ areas: c.areas.filter((a) => a !== area) }),
    });
  }
  for (const s of c.surface) {
    chips.push({
      key: `surface:${s}`,
      label: SURFACE_TYPE_LABEL[s],
      clear: () => patch({ surface: c.surface.filter((v) => v !== s) }),
    });
  }
  for (const lvl of c.level) {
    const meta = LEVELS.find((l) => l.value === lvl);
    chips.push({
      key: `level:${lvl}`,
      label: meta?.label ?? lvl,
      clear: () => patch({ level: c.level.filter((v) => v !== lvl) }),
    });
  }
  for (const key of c.durationBuckets) {
    const meta = DURATION_BUCKETS.find((b) => b.key === key);
    chips.push({
      key: `duration:${key}`,
      label: meta?.label ?? key,
      clear: () => patch({ durationBuckets: c.durationBuckets.filter((v) => v !== key) }),
    });
  }
  if (c.distanceKm[0] > DISTANCE_MIN || c.distanceKm[1] < DISTANCE_MAX) {
    chips.push({
      key: "distance",
      label: `${c.distanceKm[0]}–${c.distanceKm[1]} km`,
      clear: () => patch({ distanceKm: [DISTANCE_MIN, DISTANCE_MAX] }),
    });
  }
  if (c.climbM[0] > CLIMB_MIN || c.climbM[1] < CLIMB_MAX) {
    chips.push({
      key: "climb",
      label: `${c.climbM[0]}–${c.climbM[1]} m climb`,
      clear: () => patch({ climbM: [CLIMB_MIN, CLIMB_MAX] }),
    });
  }
  return chips;
}
