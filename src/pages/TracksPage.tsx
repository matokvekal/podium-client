/**
 * Find Tracks — the route-planning tool. Map first, then a compact filter, then results one
 * card at a time (prev/next, not a scrolled list — see plan/server-tasks.md and the plan file
 * this was built from for why).
 *
 * Route:    /routes
 * Loads:    lib/mock-tracks.ts via store/tracksStore.ts — stands in for a future GET /tracks.
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
  AlertTriangle,
  Bike,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Heart,
  Layers,
  MapPin,
  Minus,
  Mountain,
  MountainSnow,
  PersonStanding,
  Route,
  Search,
  Waves,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { RangeSlider } from "../app/RangeSlider";
import { TrackCard } from "../app/TrackCard";
import { useAuth } from "../auth/AuthContext";
import { countryFlagEmoji } from "../lib/country-flag";
import {
  CLIMB_MAX,
  CLIMB_MIN,
  DISTANCE_MAX,
  DISTANCE_MIN,
  type SurfaceType,
} from "../lib/mock-tracks";
import { useTrackFiltersStore } from "../store/trackFiltersStore";
import { useTracksStore } from "../store/tracksStore";
import styles from "./TracksPage.module.css";

const TrackMap = lazy(() => import("../app/TrackMap"));

const SURFACE_FILTERS: { value: SurfaceType; label: string; icon: typeof Bike }[] = [
  { value: "road", label: "Road", icon: Bike },
  { value: "gravel", label: "Gravel", icon: Route },
  { value: "mtb", label: "MTB", icon: Mountain },
  { value: "running", label: "Running", icon: Footprints },
  { value: "hiking", label: "Hiking", icon: PersonStanding },
];

const COUNTRY_FILTERS: { code: string; label: string }[] = [
  { code: "IL", label: "Israel" },
  { code: "GB", label: "England" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "FR", label: "France" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLIMB_PRESETS: { label: string; icon: typeof Minus; range: [number, number] }[] = [
  { label: "Flat", icon: Minus, range: [0, 300] },
  { label: "Rolling hills", icon: Waves, range: [300, 1000] },
  { label: "Mountains", icon: Mountain, range: [1000, 2000] },
  { label: "High mountains", icon: MountainSnow, range: [2000, CLIMB_MAX] },
];

export function TracksPage() {
  const { status, profile } = useAuth();
  const commentAuthor =
    status === "signed-in" ? (profile?.nickname ?? profile?.firstName ?? "Rider") : "Guest";

  const tracks = useTracksStore((state) => state.tracks);
  const loading = useTracksStore((state) => state.loading);
  const error = useTracksStore((state) => state.error);
  const loadTracks = useTracksStore((state) => state.loadTracks);
  const toggleFavoriteTrack = useTracksStore((state) => state.toggleFavoriteTrack);
  const toggleLikeTrack = useTracksStore((state) => state.toggleLikeTrack);
  const addComment = useTracksStore((state) => state.addComment);

  const location = useTrackFiltersStore((s) => s.location);
  const countryCode = useTrackFiltersStore((s) => s.countryCode);
  const surfaceType = useTrackFiltersStore((s) => s.surfaceType);
  const distanceRange = useTrackFiltersStore((s) => s.distanceRange);
  const climbRange = useTrackFiltersStore((s) => s.climbRange);
  const multiDayOnly = useTrackFiltersStore((s) => s.multiDayOnly);
  const avoidBusyRoads = useTrackFiltersStore((s) => s.avoidBusyRoads);
  const dayOfWeek = useTrackFiltersStore((s) => s.dayOfWeek);
  const favoritesOnly = useTrackFiltersStore((s) => s.favoritesOnly);
  const showHazards = useTrackFiltersStore((s) => s.showHazards);
  const showPois = useTrackFiltersStore((s) => s.showPois);
  const setLocation = useTrackFiltersStore((s) => s.setLocation);
  const setCountryCode = useTrackFiltersStore((s) => s.setCountryCode);
  const setSurfaceType = useTrackFiltersStore((s) => s.setSurfaceType);
  const setDistanceRange = useTrackFiltersStore((s) => s.setDistanceRange);
  const setClimbRange = useTrackFiltersStore((s) => s.setClimbRange);
  const setMultiDayOnly = useTrackFiltersStore((s) => s.setMultiDayOnly);
  const setAvoidBusyRoads = useTrackFiltersStore((s) => s.setAvoidBusyRoads);
  const setDayOfWeek = useTrackFiltersStore((s) => s.setDayOfWeek);
  const setFavoritesOnly = useTrackFiltersStore((s) => s.setFavoritesOnly);
  const setShowHazards = useTrackFiltersStore((s) => s.setShowHazards);
  const setShowPois = useTrackFiltersStore((s) => s.setShowPois);
  const clearFilters = useTrackFiltersStore((s) => s.clearFilters);

  const [countryOpen, setCountryOpen] = useState(false);
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    loadTracks({
      location: location || undefined,
      countryCode,
      surfaceType,
      minDistanceKm: distanceRange[0],
      maxDistanceKm: distanceRange[1],
      minClimbM: climbRange[0],
      maxClimbM: climbRange[1],
      multiDayOnly: multiDayOnly || undefined,
      avoidBusyRoads: avoidBusyRoads || undefined,
    });
    setIndex(0);
  }, [
    location,
    countryCode,
    surfaceType,
    distanceRange,
    climbRange,
    multiDayOnly,
    avoidBusyRoads,
    loadTracks,
  ]);

  const visibleTracks = useMemo(
    () => (favoritesOnly ? tracks.filter((t) => t.favorite) : tracks),
    [tracks, favoritesOnly],
  );

  // Clamp rather than reset via an effect — visibleTracks can also shrink from the favorites
  // toggle, not just the filter-driven loadTracks() above, and this covers both without a
  // second effect whose only job is calling setIndex.
  const clampedIndex = Math.min(index, Math.max(visibleTracks.length - 1, 0));
  const current = visibleTracks[clampedIndex] ?? null;
  const selectedCountry = COUNTRY_FILTERS.find((c) => c.code === countryCode);
  const selectedSurface = SURFACE_FILTERS.find((s) => s.value === surfaceType);

  // Quick-scan colour per day-of-week button, from the currently viewed track's own
  // hazards: red = a rider reported it dangerous, purple = very dangerous. Deliberately two
  // tiers here (unlike TrackCard/TrackMap, which only ever surface "high" — see their doc
  // comments) — this is a compact planning aid on the filter itself, not a headline claim.
  function dayHazardColor(day: number): string | undefined {
    if (!current) return undefined;
    const onDay = current.hazards.filter((h) => h.dayOfWeek === day);
    if (onDay.some((h) => h.severity === "high")) return "#8b5cf6";
    if (onDay.some((h) => h.severity === "medium")) return "#df4b7b";
    return undefined;
  }

  return (
    <div className="stack">
      <div className={styles.topRow}>
        <div className={styles.dropdownGroup}>
          <div className={styles.dropdownWrap}>
            <button
              type="button"
              className={`button button--quiet ${styles.dropdownTrigger}`}
              onClick={() => {
                setCountryOpen((v) => !v);
                setSurfaceOpen(false);
              }}
              aria-label={`Country: ${selectedCountry?.label ?? countryCode}`}
              title={selectedCountry?.label}
            >
              {countryFlagEmoji(countryCode)}
              <ChevronDown width={12} height={12} aria-hidden="true" style={{ marginLeft: 2 }} />
            </button>
            {countryOpen && (
              <div className={styles.dropdownPanel}>
                {COUNTRY_FILTERS.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className={styles.dropdownOption}
                    onClick={() => {
                      setCountryCode(c.code);
                      setCountryOpen(false);
                    }}
                    title={c.label}
                  >
                    {countryFlagEmoji(c.code)} {c.code}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.dropdownWrap}>
            <button
              type="button"
              className={`button button--quiet ${styles.dropdownTrigger}`}
              onClick={() => {
                setSurfaceOpen((v) => !v);
                setCountryOpen(false);
              }}
              aria-label={`Surface: ${selectedSurface?.label ?? surfaceType}`}
              title={selectedSurface?.label}
            >
              {selectedSurface && (
                <selectedSurface.icon width={14} height={14} aria-hidden="true" />
              )}
              <ChevronDown width={12} height={12} aria-hidden="true" style={{ marginLeft: 2 }} />
            </button>
            {surfaceOpen && (
              <div className={styles.dropdownPanel}>
                {SURFACE_FILTERS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={styles.dropdownOption}
                    onClick={() => {
                      setSurfaceType(s.value);
                      setSurfaceOpen(false);
                    }}
                  >
                    <s.icon width={14} height={14} aria-hidden="true" style={{ marginRight: 8 }} />
                    {s.label}
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
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setLayersOpen((v) => !v)}
            aria-label="Layers"
            title="Layers"
          >
            <Layers width={15} height={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {layersOpen && (
        <div className={styles.layersPanel}>
          <label className={styles.layerToggle}>
            <input
              type="checkbox"
              checked={showHazards}
              onChange={(e) => setShowHazards(e.target.checked)}
            />
            <AlertTriangle width={14} height={14} aria-hidden="true" />
            Hazards
          </label>
          <label className={styles.layerToggle}>
            <input
              type="checkbox"
              checked={showPois}
              onChange={(e) => setShowPois(e.target.checked)}
            />
            <MapPin width={14} height={14} aria-hidden="true" />
            Gas / restrooms / lodging / shops
          </label>
        </div>
      )}

      <div>
        <h1 style={{ margin: 0 }}>{current?.name ?? "Browse tracks"}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {visibleTracks.length} track{visibleTracks.length === 1 ? "" : "s"} found
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
            showHazards={showHazards}
            showPois={showPois}
            dayOfWeek={dayOfWeek}
            onSelectTrack={(id) => {
              const found = visibleTracks.findIndex((t) => t.id === id);
              if (found >= 0) setIndex(found);
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

          <label className="row" style={{ gap: "8px" }}>
            <input
              type="checkbox"
              checked={multiDayOnly}
              onChange={(e) => setMultiDayOnly(e.target.checked)}
            />
            Multi-day trips only
          </label>
          <label className="row" style={{ gap: "8px" }}>
            <input
              type="checkbox"
              checked={avoidBusyRoads}
              onChange={(e) => setAvoidBusyRoads(e.target.checked)}
            />
            Avoid busy roads
          </label>

          <div className="stack" style={{ gap: "6px" }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Planning to ride on — narrows hazards shown to that day
            </span>
            <div className={styles.dayRow}>
              <button
                type="button"
                className={
                  dayOfWeek === null ? `${styles.dayBtn} ${styles.dayBtnActive}` : styles.dayBtn
                }
                onClick={() => setDayOfWeek(null)}
              >
                Any
              </button>
              {DAY_LABELS.map((label, value) => {
                const color = dayHazardColor(value);
                return (
                  <button
                    key={label}
                    type="button"
                    className={
                      dayOfWeek === value
                        ? `${styles.dayBtn} ${styles.dayBtnActive}`
                        : styles.dayBtn
                    }
                    style={color ? { borderTopColor: color, borderTopWidth: 3 } : undefined}
                    onClick={() => setDayOfWeek(value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

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
        current && (
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="button button--quiet"
                disabled={clampedIndex === 0}
                onClick={() => setIndex(Math.max(0, clampedIndex - 1))}
                aria-label="Previous track"
              >
                <ChevronLeft width={18} height={18} aria-hidden="true" />
              </button>
              <span className="muted">
                {clampedIndex + 1} of {visibleTracks.length}
              </span>
              <button
                type="button"
                className="button button--quiet"
                disabled={clampedIndex === visibleTracks.length - 1}
                onClick={() => setIndex(Math.min(visibleTracks.length - 1, clampedIndex + 1))}
                aria-label="Next track"
              >
                <ChevronRight width={18} height={18} aria-hidden="true" />
              </button>
            </div>

            <div key={current.id} className={styles.cardSlide}>
              <TrackCard
                track={current}
                dayOfWeek={dayOfWeek}
                commentAuthor={commentAuthor}
                onToggleFavorite={toggleFavoriteTrack}
                onToggleLike={toggleLikeTrack}
                onAddComment={addComment}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
