/**
 * The track browser: search, filter, sort and an infinite grid of track cards.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM TrackGallerySheet. This same browser is now two things:
 *
 *   "page"   /routes — Find Tracks, open to every rider, the app's front door to the library.
 *   "modal"  the create form's picker, opened from "See other rides".
 *
 * They are the same product. A rider who learns the filters on Find Tracks must find exactly
 * the same ones when they come to build a ride, so there is one implementation and the variant
 * decides only the chrome around it. TrackGallerySheet is now a portal, an overlay and a scroll
 * lock wrapped around this component — nothing more.
 *
 * THE ONE REAL BEHAVIOURAL DIFFERENCE is what scrolls. The modal owns the whole viewport and
 * has its own scroller, so its IntersectionObserver has to watch that element; the page scrolls
 * with the document, so its observer watches the viewport (root: null). Everything else —
 * state, query building, paging, cards — is shared.
 *
 * SCALE IS STILL THE CONSTRAINT (see useTrackGallery and TrackMiniMap): the list pages against
 * the server's own limit/offset, every row carries its own tiny route preview so scrolling makes
 * one request per page and none per card, the detailed line is fetched only when a rider
 * explores a card's map, and only on-screen cards hold a live map.
 */

import { ArrowUp, ArrowUpDown, Heart, Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { detectDefaultCountryCode, flagEmoji, orderedCountries } from "../lib/countries";
import type { EventSummary } from "../lib/local-db";
import { IL_REGIONS, regionLabel } from "../lib/regions";
import { DURATION_BUCKETS } from "../lib/ride-duration";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL, type SurfaceType } from "../lib/surface-types";
import {
  TRACK_SORT_LABEL,
  type TrackGalleryCriteria,
  type TrackGallerySort,
  trackGalleryActiveFilterCount,
} from "../lib/track-gallery-filter";
import { CLIMB_MAX, CLIMB_MIN, DISTANCE_MAX, DISTANCE_MIN } from "../lib/track-types";
import { useTrackGalleryFiltersStore } from "../store/trackGalleryFiltersStore";
import { type DistanceIcon, GravelBikeIcon, MtbBikeIcon, RoadBikeIcon } from "./ActivityIcons";
import { RangeSlider } from "./RangeSlider";
import styles from "./TrackGalleryBrowser.module.css";
import { TrackGalleryCard } from "./TrackGalleryCard";
import sheet from "./TrackGallerySheet.module.css";
import { type GallerySource, type LoadMoreProblem, useTrackGallery } from "./useTrackGallery";

export interface TrackGalleryBrowserProps {
  variant: "page" | "modal";
  onPick: (event: EventSummary) => void;
  /** Modal only — renders the close button and answers Escape. */
  onClose?: () => void;
}

/**
 * The three disciplines that get a one-tap filter beside the title.
 *
 * Bikes only, and the real drawn ones (ActivityIcons) rather than lucide's single generic
 * bicycle — a road bike, a gravel bike and an MTB are three different answers to "can I ride
 * this", and the drop bar / fat tyre / suspension fork is what makes them tellable apart at
 * this size. Each carries its word underneath, because an icon alone still has to be learnt.
 *
 * Running and hiking are deliberately NOT here: this is a row for choosing a bike, and their
 * distance is not ridden. Both are still in the Filter panel, which lists all five.
 */
const QUICK_SURFACES: { type: SurfaceType; icon: DistanceIcon; label: string }[] = [
  { type: "road", icon: RoadBikeIcon, label: "Road" },
  { type: "gravel", icon: GravelBikeIcon, label: "Gravel" },
  { type: "mtb", icon: MtbBikeIcon, label: "MTB" },
];

/** Add or remove one value from a multi-select list. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TrackGalleryBrowser({ variant, onPick, onClose }: TrackGalleryBrowserProps) {
  const isModal = variant === "modal";
  const [source, setSource] = useState<GallerySource>("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { profile, status } = useAuth();
  const signedIn = status === "signed-in";
  const defaultCountry = profile?.country ?? detectDefaultCountryCode();

  const criteria = useTrackGalleryFiltersStore((s) => s.criteria);
  const sort = useTrackGalleryFiltersStore((s) => s.sort);
  const setCriteria = useTrackGalleryFiltersStore((s) => s.setCriteria);
  const setSort = useTrackGalleryFiltersStore((s) => s.setSort);
  const seedCountry = useTrackGalleryFiltersStore((s) => s.seedCountry);
  const clearFiltersAction = useTrackGalleryFiltersStore((s) => s.clearFilters);
  const clearFilters = () => clearFiltersAction(defaultCountry);
  const activeCount = trackGalleryActiveFilterCount(criteria, defaultCountry);

  // Seed the country filter from the rider's country once — an Israeli opens Find Tracks scoped
  // to Israel without touching anything. seedCountry is a no-op after the first call / a
  // persisted choice.
  useEffect(() => {
    seedCountry(defaultCountry);
  }, [seedCountry, defaultCountry]);

  // A signed-out rider has no favourites, and the server ignores the filter for them. If a
  // stored preference still has it on — they filtered, then signed out — clear it rather than
  // leaving a toggle pressed that does nothing.
  useEffect(() => {
    if (!signedIn && criteria.favoritesOnly) setCriteria({ favoritesOnly: false });
  }, [signedIn, criteria.favoritesOnly, setCriteria]);

  const { rides, total, loading, loadingMore, error, hasMore, loadMore, loadMoreProblem, retry } =
    useTrackGallery(source, search, criteria, sort);

  // Cards are memoized, and callers pass a fresh onPick every render (TracksPage builds it
  // inline). Routing it through a ref keeps the identity the cards see constant, so typing in the
  // search box or opening a filter panel does not re-render every card in a long list.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickTrack = useCallback((event: EventSummary) => onPickRef.current(event), []);

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
      onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, filterOpen, sortOpen]);

  // Focus starts on Close: a keyboard or screen-reader user lands on the way out, not partway
  // down a list of hundreds of cards. The page variant has no close button and no focus to take.
  useEffect(() => {
    if (isModal) closeRef.current?.focus();
  }, [isModal]);

  // Page in the next batch as the sentinel comes into view. The modal watches its own scroller;
  // the page watches the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = isModal ? scrollRef.current : null;
    if (!sentinel || (isModal && !root) || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, isModal]);

  // "Back to top" appears once the rider is far enough down that scrolling back by hand is a
  // chore. The list is infinite, so without it the only way out of a long session of scrolling
  // is a long session of scrolling — the thing that makes an endless feed feel like a trap.
  //
  // One screen and a half is the threshold: far enough that it never flickers on a short list,
  // close enough that it is there when wanted. Passive listener, and it only ever flips a
  // boolean, so it costs nothing per frame.
  useEffect(() => {
    const scroller = isModal ? scrollRef.current : null;
    const read = () => (scroller ? scroller.scrollTop : window.scrollY);
    const onScroll = () => setShowTop(read() > window.innerHeight * 1.5);
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener("scroll", onScroll);
  }, [isModal]);

  function scrollToTop() {
    const scroller = isModal ? scrollRef.current : null;
    if (scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function switchSource(next: GallerySource) {
    setSource(next);
    if (isModal) scrollRef.current?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }

  function patch(next: Partial<TrackGalleryCriteria>) {
    setCriteria(next);
  }

  const showCount = loading ? "…" : String(total);
  const activeChips = buildActiveChips(criteria, patch, defaultCountry);

  const results = (
    <>
      {error && (
        <p className="banner banner--error" role="alert">
          {error}{" "}
          {source === "all" && (
            <button type="button" className="button button--quiet" onClick={retry}>
              Try again
            </button>
          )}
        </p>
      )}

      {loading && rides.length === 0 ? (
        <div className={sheet.centered}>
          <span className="spinner" aria-hidden="true" />
          <span className="muted">Loading tracks…</span>
        </div>
      ) : rides.length === 0 ? (
        <p className={`muted ${sheet.centered}`}>
          {emptyMessage(criteria, search, activeCount, source)}
        </p>
      ) : (
        <div className={`card-grid ${sheet.grid}`}>
          {rides.map((event) => (
            <TrackGalleryCard
              key={event.id}
              event={event}
              anonymousDetail={source === "all"}
              onPick={pickTrack}
              variant={variant}
            />
          ))}
        </div>
      )}

      {hasMore && <div ref={sentinelRef} className={sheet.sentinel} aria-hidden="true" />}

      {loadingMore && (
        <div className={sheet.centered}>
          <span className="spinner" aria-hidden="true" />
          <span className="muted">Loading more…</span>
        </div>
      )}

      {/* A page failed. The cards already loaded stay exactly as they are; nothing here retries by
          itself (the sentinel above is not mounted while this shows) — the hook makes at most one
          timed retry after a 429's Retry-After, and after that only this button asks again. */}
      {loadMoreProblem && (
        <div className={sheet.centered} role="status">
          <span className="muted">{loadMoreProblemText(loadMoreProblem)}</span>
          <button type="button" className="button button--quiet" onClick={retry}>
            Try again
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className={isModal ? `${sheet.header} ${styles.headerRow}` : styles.pageHeader}>
        <div className={sheet.headerText}>
          <h2 className={isModal ? sheet.title : styles.pageTitle}>
            {isModal ? "Choose a track" : "Find Tracks"}
          </h2>
          <p className={sheet.subtitle}>
            {loading
              ? "Finding tracks…"
              : isModal
                ? `${total} ${total === 1 ? "ride" : "rides"} you can start from`
                : `${total} ${total === 1 ? "track" : "tracks"} people have ridden`}
          </p>
        </div>
        {/* The disciplines, as icons, right of the title — the fastest filter there is and the
            one a rider reaches for first ("show me MTB"). It writes the same criteria.surface
            the Filter panel does, so the two always agree and either can clear the other. */}
        <div className={styles.surfaceQuick}>
          {QUICK_SURFACES.map(({ type, icon: Icon, label }) => {
            const on = criteria.surface.includes(type);
            return (
              <button
                key={type}
                type="button"
                className={styles.surfaceBtn}
                data-on={on}
                onClick={() => patch({ surface: toggle(criteria.surface, type) })}
                aria-pressed={on}
                title={label}
              >
                <Icon className={styles.surfaceIcon} aria-hidden="true" />
                <span className={styles.surfaceLabel}>{label}</span>
              </button>
            );
          })}
        </div>

        {isModal && (
          <button
            ref={closeRef}
            type="button"
            className={sheet.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X width={20} height={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Sticky on the page so the filters stay reachable however far a rider has scrolled — on
          a phone, scrolling back to the top to change one chip is what makes a long list
          unusable. The modal has its own fixed header and does not need it. */}
      <div className={isModal ? sheet.controls : `${sheet.controls} ${styles.stickyControls}`}>
        <div className={sheet.sourceToggle}>
          <button
            type="button"
            className={source === "all" ? "button" : "button button--quiet"}
            onClick={() => switchSource("all")}
            aria-pressed={source === "all"}
            aria-label="All rides"
          >
            All
          </button>
          <button
            type="button"
            className={source === "mine" ? "button" : "button button--quiet"}
            onClick={() => switchSource("mine")}
            aria-pressed={source === "mine"}
            aria-label="My rides"
          >
            My
          </button>
        </div>
        <div className={sheet.searchWrap}>
          <Search className={sheet.searchIcon} aria-hidden="true" />
          <input
            className={sheet.search}
            placeholder="Search tracks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search tracks"
          />
        </div>
        {/* Saved is a toolbar toggle rather than a row in the filter panel: it is the one filter
            a rider flips constantly ("just show me my shortlist"), and burying it two taps deep
            is what makes a saved list go unused. Hidden when signed out, where it could only
            ever return nothing.

            Turning it on also switches to All rides. "My rides" is served by eventsStore from
            GET /events, which carries no favourite state — only /events/public resolves it —
            so leaving the source alone would show an empty grid and look like the saved list
            had been lost. Saved is a view over everything, which is also what a rider means
            by it. */}
        {signedIn && (
          <button
            type="button"
            className={`${sheet.iconBtn} ${styles.savedBtn}`}
            data-on={criteria.favoritesOnly}
            onClick={() => {
              const next = !criteria.favoritesOnly;
              patch({ favoritesOnly: next });
              if (next) switchSource("all");
            }}
            aria-pressed={criteria.favoritesOnly}
            aria-label="Show only saved tracks"
          >
            <Heart
              className={sheet.iconGlyph}
              fill={criteria.favoritesOnly ? "currentColor" : "none"}
              aria-hidden="true"
            />
            <span className={sheet.iconLabel}>Saved</span>
          </button>
        )}
        <button
          type="button"
          className={sheet.iconBtn}
          onClick={() => {
            setSortOpen(false);
            setFilterOpen(true);
          }}
          aria-label="Filter tracks"
        >
          <SlidersHorizontal className={sheet.iconGlyph} aria-hidden="true" />
          <span className={sheet.iconLabel}>Filter</span>
          {activeCount > 0 && <span className={sheet.iconCount}>{activeCount}</span>}
        </button>
        <button
          type="button"
          className={sheet.iconBtn}
          onClick={() => {
            setFilterOpen(false);
            setSortOpen(true);
          }}
          aria-label="Sort tracks"
        >
          <ArrowUpDown className={sheet.iconGlyph} aria-hidden="true" />
          <span className={sheet.iconLabel}>Sort</span>
        </button>
      </div>

      {activeChips.length > 0 && (
        <div className={sheet.activeFilters}>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={sheet.activeFilterChip}
              onClick={chip.clear}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <X width={12} height={12} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className={sheet.clearFiltersBtn} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {isModal ? (
        <div className={sheet.scroller} ref={scrollRef}>
          {results}
        </div>
      ) : (
        <div className={styles.pageResults}>{results}</div>
      )}

      {(filterOpen || sortOpen) && (
        <div
          className={sheet.panelOverlay}
          onClick={() => {
            setFilterOpen(false);
            setSortOpen(false);
          }}
          aria-hidden="true"
        />
      )}

      <div
        className={filterOpen ? `${sheet.panel} ${sheet.panelOpen}` : sheet.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Filter tracks"
      >
        <div className={sheet.panelHeader}>
          <h3 className={sheet.panelTitle}>Filter</h3>
          <span className={sheet.panelCount}>
            {loading ? "…" : `${total} match${total === 1 ? "" : "es"}`}
          </span>
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
        <div className={sheet.panelBody}>
          <div className={sheet.panelGroup}>
            <span className={sheet.panelGroupLabel}>Country</span>
            <select
              className={sheet.panelSelect}
              value={criteria.country ?? ""}
              onChange={(e) => patch({ country: e.target.value || null })}
              aria-label="Country"
            >
              <option value="">Any country</option>
              {orderedCountries(defaultCountry).map((c) => (
                <option key={c.code} value={c.code}>
                  {flagEmoji(c.code)} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={sheet.panelGroup}>
            <span className={sheet.panelGroupLabel}>Area</span>
            <select
              className={sheet.panelSelect}
              value={criteria.region ?? ""}
              onChange={(e) => patch({ region: e.target.value || null })}
              aria-label="Area"
            >
              <option value="">All areas</option>
              {IL_REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.he}
                </option>
              ))}
            </select>
          </div>

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

          <div className={sheet.panelGroup}>
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
          <div className={sheet.panelGroup}>
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
                onClick={() => patch({ durationBuckets: toggle(criteria.durationBuckets, b.key) })}
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

      {showTop && (
        <button
          type="button"
          className={styles.toTop}
          onClick={scrollToTop}
          aria-label="Back to top"
        >
          <ArrowUp className={styles.toTopIcon} aria-hidden="true" />
        </button>
      )}

      <div
        className={sortOpen ? `${sheet.panel} ${sheet.panelOpen}` : sheet.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Sort tracks"
      >
        <div className={sheet.panelHeader}>
          <h3 className={sheet.panelTitle}>Sort</h3>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setSortOpen(false)}
            aria-label="Close sort"
          >
            <X width={18} height={18} aria-hidden="true" />
          </button>
        </div>
        <div className={sheet.panelBody}>
          {(Object.keys(TRACK_SORT_LABEL) as TrackGallerySort[]).map((s) => (
            <button
              key={s}
              type="button"
              className={sheet.sortOption}
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
    </>
  );
}

/** "45s" for a short wait, "12 min" for a long one — 707s is not a number anyone reads. */
function formatWait(seconds: number): string {
  return seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

/** What to tell the rider when a page of more tracks would not load. */
function loadMoreProblemText(problem: LoadMoreProblem): string {
  if (problem.kind === "failed") return "Could not load more tracks.";
  return problem.retryInSeconds === null
    ? "Still too many requests right now. Give it a minute, then try again."
    : `Too many requests right now — trying again in about ${formatWait(problem.retryInSeconds)}.`;
}

/**
 * Why the grid is empty, in the rider's terms. The saved case comes first and says what to do
 * about it — an empty shortlist is the one empty state that is not a dead end.
 */
function emptyMessage(
  criteria: TrackGalleryCriteria,
  search: string,
  activeCount: number,
  source: GallerySource,
): string {
  if (criteria.favoritesOnly) {
    return "No saved tracks yet. Tap the heart on any track to keep it here.";
  }
  if (search.trim() || activeCount > 0) return "No tracks match those filters.";
  if (source === "mine") return "None of your rides has a track yet.";
  return "No tracks to show yet.";
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={sheet.panelGroup}>
      <span className={sheet.panelGroupLabel}>{label}</span>
      <div className={sheet.panelChips}>{children}</div>
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
      className={sheet.filterChip}
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
  defaultCountry: string | null,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (c.country !== defaultCountry) {
    chips.push({
      key: "country",
      label: c.country ? `${flagEmoji(c.country)} ${c.country}` : "Any country",
      clear: () => patch({ country: defaultCountry }),
    });
  }
  if (c.region) {
    chips.push({
      key: "region",
      label: regionLabel(c.region),
      clear: () => patch({ region: null }),
    });
  }
  // Saved has its own toolbar toggle, but it still earns a chip: it is the filter most likely
  // to be left on by accident and then blamed for an empty list.
  if (c.favoritesOnly) {
    chips.push({
      key: "favorites",
      label: "Saved",
      clear: () => patch({ favoritesOnly: false }),
    });
  }
  for (const s of c.surface) {
    chips.push({
      key: `surface:${s}`,
      label: SURFACE_TYPE_LABEL[s],
      clear: () => patch({ surface: c.surface.filter((v) => v !== s) }),
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
