/**
 * Find Tracks — the route-planning tool. Map first, then a compact filter, then results as an
 * infinite-scroll list (was prev/next arrows over a single fetched page; the server's real
 * page/pageSize paging in tracksStore now backs a scroll-triggered loadMore instead, the same
 * IntersectionObserver-over-a-sentinel pattern as TrackGallerySheet).
 *
 * Route:    /routes
 * Loads:    store/tracksStore.ts, which returns an empty list until GET /tracks is built.
 *           Air quality, hazards and POIs are all illustrative mock values; no real data
 *           provider is chosen for any of them yet.
 * Actions:  country + surface-type dropdowns (top, always visible, small, icons on the
 *           surface options); a favorites-only toggle; a search icon opens a bottom-sheet
 *           modal for everything else — location text, distance/climb range sliders,
 *           multi-day toggle, avoid-busy-roads, day-of-week, and Clear all; toggle hazard/POI
 *           map layers; page through results; favorite a track; "Plan a ride with this
 *           track" opens /events/new
 * State:    all filter/preference values live in store/trackFiltersStore.ts, persisted to
 *           localStorage so they survive a reload — only ephemeral UI state (which dropdown
 *           is open, which result card is showing) stays local to this component.
 *
 * Open to everyone, signed in or not — same as every other browse surface in this app.
 * Favoriting works for a guest too (client-only for now, see tracksStore.ts); it just won't
 * survive anything server-side until tracks are real.
 */

import {
  Bike,
  ChevronDown,
  Heart,
  MapPin,
  Minus,
  Mountain,
  MountainSnow,
  Route,
  Search,
  Waves,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RangeSlider } from "../app/RangeSlider";
import { TrackCard } from "../app/TrackCard";
import {
  CLIMB_MAX,
  CLIMB_MIN,
  DISTANCE_MAX,
  DISTANCE_MIN,
  type RouteType,
} from "../lib/track-types";
import { useTrackFiltersStore } from "../store/trackFiltersStore";
import { useTracksStore } from "../store/tracksStore";
import styles from "./TracksPage.module.css";

const TrackMap = lazy(() => import("../app/TrackMap"));

/**
 * The route library's own four types — road | gravel | mtb | mixed (server ROUTE_TYPES). NOT
 * the five event activity types: a route has no "running"/"hiking" and an event has no
 * "mixed", so offering the event list here would filter on values the endpoint rejects.
 *
 * The COUNTRY dropdown that used to sit beside this is gone. A route carries only a free-text
 * `placeName`; there is no country column and no country query parameter, so the picker could
 * only ever have filtered nothing — or worse, appeared to work while being ignored. Place is
 * searchable as text in the filter sheet, which is what the server actually supports.
 *
 * The day-of-week picker, "multi-day trips only" and "avoid busy roads" are gone for the same
 * reason: routes have no stages, no busy-road flag and no per-day data of any kind.
 */
const ROUTE_TYPE_FILTERS: {
  value: RouteType;
  label: string;
  icon: typeof Bike;
}[] = [
  { value: "road", label: "Road", icon: Bike },
  { value: "gravel", label: "Gravel", icon: Route },
  { value: "mtb", label: "MTB", icon: Mountain },
  { value: "mixed", label: "Mixed", icon: Waves },
];

const CLIMB_PRESETS: {
  label: string;
  icon: typeof Minus;
  range: [number, number];
}[] = [
  { label: "Flat", icon: Minus, range: [0, 300] },
  { label: "Rolling hills", icon: Waves, range: [300, 1000] },
  { label: "Mountains", icon: Mountain, range: [1000, 2000] },
  { label: "High mountains", icon: MountainSnow, range: [2000, CLIMB_MAX] },
];

export function TracksPage() {
  const tracks = useTracksStore((state) => state.tracks);
  const total = useTracksStore((state) => state.total);
  const loading = useTracksStore((state) => state.loading);
  const loadingMore = useTracksStore((state) => state.loadingMore);
  const error = useTracksStore((state) => state.error);
  const loadTracks = useTracksStore((state) => state.loadTracks);
  const loadMore = useTracksStore((state) => state.loadMore);
  const toggleFavoriteTrack = useTracksStore((state) => state.toggleFavoriteTrack);
  const favoriteIds = useTracksStore((state) => state.favoriteIds);

  const location = useTrackFiltersStore((s) => s.location);
  const routeType = useTrackFiltersStore((s) => s.routeType);
  const distanceRange = useTrackFiltersStore((s) => s.distanceRange);
  const climbRange = useTrackFiltersStore((s) => s.climbRange);
  const favoritesOnly = useTrackFiltersStore((s) => s.favoritesOnly);
  const setLocation = useTrackFiltersStore((s) => s.setLocation);
  const setRouteType = useTrackFiltersStore((s) => s.setRouteType);
  const setDistanceRange = useTrackFiltersStore((s) => s.setDistanceRange);
  const setClimbRange = useTrackFiltersStore((s) => s.setClimbRange);
  const setFavoritesOnly = useTrackFiltersStore((s) => s.setFavoritesOnly);
  const clearFilters = useTrackFiltersStore((s) => s.clearFilters);

  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  // Only what GET /routes/public accepts (routeLibrary.schemas.ts). A slider still at its
  // extreme is NOT sent: the server compares against distance_km / elevation_m, so sending a
  // minimum of 1 km would silently drop every route whose distance was never recorded.
  useEffect(() => {
    loadTracks({
      place: location || undefined,
      routeType,
      minDistanceKm: distanceRange[0] > DISTANCE_MIN ? distanceRange[0] : undefined,
      maxDistanceKm: distanceRange[1] < DISTANCE_MAX ? distanceRange[1] : undefined,
      minClimbM: climbRange[0] > CLIMB_MIN ? climbRange[0] : undefined,
      maxClimbM: climbRange[1] < CLIMB_MAX ? climbRange[1] : undefined,
    });
    setSelectedId(null);
  }, [location, routeType, distanceRange, climbRange, loadTracks]);

  const visibleTracks = useMemo(
    () => (favoritesOnly ? tracks.filter((t) => favoriteIds.includes(t.id)) : tracks),
    [tracks, favoritesOnly, favoriteIds],
  );

  const current = visibleTracks.find((t) => t.id === selectedId) ?? null;
  const selectedType = ROUTE_TYPE_FILTERS.find((t) => t.value === routeType);

  // Page in the next batch as the sentinel comes into view. `root: null` scrolls the viewport
  // itself — this list isn't in its own scroll region the way TrackGallerySheet's modal is.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const hasMore = tracks.length < total;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tracks.length, total, loadMore]);

  return (
    <div className="stack">
      <div className={styles.topRow}>
        <div className={styles.dropdownGroup}>
          <div className={styles.dropdownWrap}>
            <button
              type="button"
              className={`button button--quiet ${styles.dropdownTrigger}`}
              onClick={() => setSurfaceOpen((v) => !v)}
              aria-label={`Route type: ${selectedType?.label ?? "Any"}`}
              title={selectedType?.label ?? "Any type"}
            >
              {selectedType ? (
                <selectedType.icon width={14} height={14} aria-hidden="true" />
              ) : (
                <Route width={14} height={14} aria-hidden="true" />
              )}
              <ChevronDown width={12} height={12} aria-hidden="true" style={{ marginLeft: 2 }} />
            </button>
            {surfaceOpen && (
              <div className={styles.dropdownPanel}>
                {/* "Any" first — the default, and the only honest way to browse a library
                    whose routes may have no type set at all. */}
                <button
                  type="button"
                  className={styles.dropdownOption}
                  onClick={() => {
                    setRouteType(null);
                    setSurfaceOpen(false);
                  }}
                >
                  <Route width={14} height={14} aria-hidden="true" style={{ marginRight: 8 }} />
                  Any type
                </button>
                {ROUTE_TYPE_FILTERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={styles.dropdownOption}
                    onClick={() => {
                      setRouteType(t.value);
                      setSurfaceOpen(false);
                    }}
                  >
                    <t.icon width={14} height={14} aria-hidden="true" style={{ marginRight: 8 }} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.dropdownGroup}>
          <button
            type="button"
            className={favoritesOnly ? "button" : "button button--quiet"}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            aria-pressed={favoritesOnly}
            aria-label="Favorites only"
          >
            <Heart
              width={15}
              height={15}
              aria-hidden="true"
              fill={favoritesOnly ? "currentColor" : "none"}
            />
          </button>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
            title="Filters"
          >
            <Search width={15} height={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div>
        <h1 style={{ margin: 0 }}>Browse tracks</h1>
        <p className="muted" style={{ margin: 0 }}>
          {favoritesOnly || visibleTracks.length >= total
            ? `${visibleTracks.length} track${visibleTracks.length === 1 ? "" : "s"} found`
            : `${visibleTracks.length} of ${total} tracks`}
        </p>
      </div>

      {/* No map when there's nothing to plot — an empty base map (no favorites, or a filter
          combo with zero matches) reads as broken, not empty. The "No favorites yet." /
          "No tracks match" message below already covers that case. */}
      {visibleTracks.length > 0 && (
        <Suspense fallback={<div className="row muted">Loading the map…</div>}>
          <TrackMap
            tracks={visibleTracks}
            selectedTrackId={current?.id ?? null}
            onSelectTrack={(id) => {
              setSelectedId(id);
              cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </Suspense>
      )}

      {filtersOpen && (
        <div
          className={styles.sheetOverlay}
          onClick={() => setFiltersOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={filtersOpen ? `${styles.sheet} ${styles.sheetOpen}` : styles.sheet}>
        <div className={styles.sheetHeader}>
          <h2 style={{ margin: 0 }}>Filters</h2>
          <div className="row">
            <button type="button" className="button button--quiet" onClick={clearFilters}>
              Clear all
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
            >
              <X width={18} height={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={`stack ${styles.sheetBody}`}>
          <div className={styles.searchWrap}>
            <MapPin className={styles.searchIcon} aria-hidden="true" />
            <input
              className={styles.search}
              placeholder="State, area, track name…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <RangeSlider
            label="Distance"
            unit="km"
            min={DISTANCE_MIN}
            max={DISTANCE_MAX}
            step={1}
            value={distanceRange}
            onChange={setDistanceRange}
          />
          <div className="row" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
            {CLIMB_PRESETS.map((preset) => {
              const active = climbRange[0] === preset.range[0] && climbRange[1] === preset.range[1];
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={active ? "button" : "button button--quiet"}
                  onClick={() => setClimbRange(preset.range)}
                  title={preset.label}
                  aria-label={preset.label}
                >
                  <preset.icon width={15} height={15} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <RangeSlider
            label="Climb"
            unit="m"
            min={CLIMB_MIN}
            max={CLIMB_MAX}
            step={50}
            value={climbRange}
            onChange={setClimbRange}
          />

          <button type="button" className="button" onClick={() => setFiltersOpen(false)}>
            Show results
          </button>
        </div>
      </div>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      {loading && visibleTracks.length === 0 ? (
        <div className="row">
          <span className="spinner" aria-hidden="true" />
          <span className="muted">Loading…</span>
        </div>
      ) : visibleTracks.length === 0 ? (
        <p className="muted">
          {favoritesOnly ? "No favorites yet." : "No tracks match those filters."}
        </p>
      ) : (
        <div className="stack">
          {visibleTracks.map((track) => (
            <div
              key={track.id}
              ref={(el) => {
                if (el) cardRefs.current.set(track.id, el);
                else cardRefs.current.delete(track.id);
              }}
              className={track.id === selectedId ? styles.cardSelected : undefined}
            >
              <TrackCard
                track={track}
                favorite={favoriteIds.includes(track.id)}
                onToggleFavorite={toggleFavoriteTrack}
              />
            </div>
          ))}

          {/* Only wired to the server-fed "all" list — favoritesOnly is a client-side filter
              over whatever has already loaded, so there's nothing further to page in for it. */}
          {!favoritesOnly && tracks.length < total && (
            <div ref={sentinelRef} aria-hidden="true" />
          )}

          {loadingMore && (
            <div className="row" style={{ justifyContent: "center" }}>
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading more…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
