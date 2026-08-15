/**
 * Home screen — the app opens here.
 *
 * Route:    /
 * Loads:    signed in: GET /events?filter=mine and GET /events?filter=joined, merged, for
 *           "My Rides" and (filtered to finished) "Track". Everyone, signed in or not: GET
 *           /events/public (unauthenticated) for "Find Rides"/"Find Races" — the same
 *           discover list a guest with no server session and no account can browse, split by
 *           event type. See App.tsx > OpenHome.
 * Actions:  open a ride; create one or join one by code (both require signing in first);
 *           search/sort/favourite My Rides; See All toggles the compact tile row for a full
 *           searchable list; filter Find Rides/Races by Live/Upcoming/Finished
 * State:    the active tab, My Rides search/sort/favourites-filter/See-All, the Find filter
 * Calls:    GET /events, GET /events/public
 *
 * Three tabs, not two sections stacked — a guest only ever sees "Find Rides"/"Track" (there
 * is nothing to show under "My Rides" without an account, and this app's rule is that a
 * sign-in prompt only ever lives in the drawer, never on this page):
 *   - "My Rides" — a toolbar (search, sort cycle, favourites filter, Add) over what this
 *     rider owns or joined. Home view shows a compact tile row; See All swaps to the full
 *     filtered/sorted list. Signed-in only.
 *   - "Find Rides" — the public discover list (RIDE-type events only — see below), with its
 *     own Live/Upcoming/Finished filter pills and search. Browsed by anyone. Genuinely *other*
 *     people's events, never this rider's own — that's why it always reads from the public
 *     endpoint, even for a signed-in rider, rather than from GET /events's own live/upcoming/
 *     finished filters (those are scoped to events this user owns or joined — see
 *     event.service.ts's listMyEvents).
 *   - "Track" — the route/track planner (climb, distance, hazards, POIs — see TracksPage.tsx
 *     and plan/server-tasks.md Part B). This tab renders TracksPage directly rather than
 *     duplicating it; it's also reachable at /routes via the drawer. Public, same as Find
 *     Rides — it was ride history in an earlier pass of this page, corrected directly.
 *
 * No "Find Races" tab — races aren't being surfaced in discovery right now, direct call, not
 * a removed feature to rebuild without asking first. RACE-type events still exist in the data
 * model (Kind on EventCreatePage, `event.type` everywhere) and are still reachable by direct
 * link/code; only the public browse tab for them is gone.
 *
 * Every successful load is cached in IndexedDB (lib/local-db.ts) and shown first on the next
 * visit, before the network request resolves — a cold start with no signal still shows the
 * last known list instead of a blank screen. A failed refresh with a cache present is shown
 * as "stale", not an error; only an error with nothing cached shows the red banner.
 */

import { ArrowUpDown, Bike, Compass, Heart, Map as MapIcon, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyRidesState } from "../app/EmptyRidesState";
import { EventCard } from "../app/EventCard";
import { EventTile } from "../app/EventTile";
import { FIGMA_TAG_LABEL, type FigmaStatus, figmaStatus } from "../app/event-visuals";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { useEventsStore } from "../store/eventsStore";
import styles from "./EventsListPage.module.css";
import { TracksPage } from "./TracksPage";

type EventTab = "myRides" | "findRides" | "track";

type FindFilter = "all" | FigmaStatus;

const FIND_FILTERS: { value: FindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: FIGMA_TAG_LABEL.live },
  { value: "upcoming", label: FIGMA_TAG_LABEL.upcoming },
  { value: "finished", label: FIGMA_TAG_LABEL.finished },
];

function byStatus(events: EventSummary[], filter: FindFilter): EventSummary[] {
  if (filter === "all") return events;
  return events.filter((event) => figmaStatus(event.status) === filter);
}

function timestamp(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

type SortKey = "date" | "name" | "area";
const SORT_CYCLE: SortKey[] = ["date", "name", "area"];
const SORT_LABEL: Record<SortKey, string> = { date: "Date", name: "Name", area: "Area" };

// Home row: most recent My Rides only, before "See All" takes over.
const HOME_ROW_LIMIT = 10;

export function EventsListPage() {
  const { status } = useAuth();
  const authed = status === "signed-in";

  const [activeTab, setActiveTab] = useState<EventTab>(authed ? "myRides" : "findRides");
  // A guest (or a session that just expired) can't be sitting on My Rides — everything else
  // (Find Rides, Find Races, Track) is public.
  useEffect(() => {
    if (!authed && activeTab === "myRides") {
      setActiveTab("findRides");
    }
  }, [authed, activeTab]);

  const myRides = useEventsStore((state) => state.myRides);
  const myRidesLoading = useEventsStore((state) => state.myRidesLoading);
  const otherRides = useEventsStore((state) => state.otherRides);
  const otherLoading = useEventsStore((state) => state.otherLoading);
  const otherError = useEventsStore((state) => state.otherError);
  const loadMyRides = useEventsStore((state) => state.loadMyRides);
  const loadOtherRides = useEventsStore((state) => state.loadOtherRides);
  const toggleFavoriteRide = useEventsStore((state) => state.toggleFavoriteRide);

  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // My Rides — owned + joined, merged. Only fetched while signed in.
  useEffect(() => {
    loadMyRides(authed);
  }, [authed, loadMyRides]);

  async function handleToggleFavorite(id: string) {
    await toggleFavoriteRide(id);
  }

  // My Rides, Meetup-style: Live (any status "live", regardless of organizing or joined) always
  // first and blinking — asked for directly ("live ride ... has to be at top in some blinking
  // so i can get in fast") — then Upcoming (soonest start first), then Past (most recently
  // ended first). Reuses event-visuals.ts's figmaStatus so this always agrees with the same
  // live/upcoming/finished bucketing EventCard's own status tag and the Find Rides filter use.
  const myRidesByBucket = useMemo(() => {
    const live = myRides.filter((e) => figmaStatus(e.status) === "live");
    const upcoming = [...myRides]
      .filter((e) => figmaStatus(e.status) === "upcoming")
      .sort((a, b) => timestamp(a.startsAt) - timestamp(b.startsAt));
    const past = [...myRides]
      .filter((e) => figmaStatus(e.status) === "finished")
      .sort((a, b) => timestamp(b.startsAt) - timestamp(a.startsAt));
    return { live, upcoming, past };
  }, [myRides]);

  // Home row: live rides always shown in full (there's rarely more than one or two), then
  // Upcoming, then Past, filling in up to HOME_ROW_LIMIT total tiles.
  const homeRow = useMemo(() => {
    const { live, upcoming, past } = myRidesByBucket;
    const upcomingSlice = upcoming.slice(0, Math.max(0, HOME_ROW_LIMIT - live.length));
    const pastSlice = past.slice(
      0,
      Math.max(0, HOME_ROW_LIMIT - live.length - upcomingSlice.length),
    );
    return { live, upcoming: upcomingSlice, past: pastSlice };
  }, [myRidesByBucket]);

  // See-All list: search + favourites filter first, then bucketed the same way as the home
  // row, with the chosen sort applied inside each bucket (Live is small enough that its own
  // order doesn't matter much, but stays consistent by using the same comparator).
  const q = search.trim().toLowerCase();
  const filteredMyRidesByBucket = useMemo(() => {
    const matches = myRides.filter((event) => {
      if (favoritesOnly && !event.favorite) return false;
      if (!q) return true;
      return (
        event.name.toLowerCase().includes(q) || (event.location ?? "").toLowerCase().includes(q)
      );
    });
    const sorter = (a: EventSummary, b: EventSummary) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "area") {
        return (
          (a.location ?? "").localeCompare(b.location ?? "") ||
          timestamp(b.startsAt) - timestamp(a.startsAt)
        );
      }
      // Default: date, newest first.
      return timestamp(b.startsAt) - timestamp(a.startsAt);
    };
    return {
      live: matches.filter((e) => figmaStatus(e.status) === "live").sort(sorter),
      upcoming: matches.filter((e) => figmaStatus(e.status) === "upcoming").sort(sorter),
      past: matches.filter((e) => figmaStatus(e.status) === "finished").sort(sorter),
      total: matches.length,
    };
  }, [myRides, q, favoritesOnly, sortBy]);

  // Find Rides — the public list, identical for everyone, RIDE-type only (see the doc comment
  // above re: no Find Races tab). Fetched once; the pill filter and search are both
  // client-side, since the endpoint itself has neither param.
  const [findFilter, setFindFilter] = useState<FindFilter>("all");
  const [findShowSearch, setFindShowSearch] = useState(false);
  const [findSearch, setFindSearch] = useState("");

  useEffect(() => {
    loadOtherRides();
  }, [loadOtherRides]);

  const findQ = findSearch.trim().toLowerCase();
  const visibleFindRides = byStatus(
    otherRides.filter((event) => event.type === "RIDE"),
    findFilter,
  ).filter((event) => {
    if (!findQ) return true;
    return (
      event.name.toLowerCase().includes(findQ) ||
      (event.location ?? "").toLowerCase().includes(findQ)
    );
  });

  return (
    <div className="stack">
      <div className={styles.tabBar}>
        {authed && (
          <button
            type="button"
            className={activeTab === "myRides" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("myRides")}
          >
            <Bike className={styles.tabIcon} aria-hidden="true" />
            My Rides
          </button>
        )}
        <button
          type="button"
          className={activeTab === "findRides" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("findRides")}
        >
          <Compass className={styles.tabIcon} aria-hidden="true" />
          Find Rides
        </button>
        <button
          type="button"
          className={activeTab === "track" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("track")}
        >
          <MapIcon className={styles.tabIcon} aria-hidden="true" />
          Find Tracks
        </button>
      </div>

      {activeTab === "myRides" && authed && (
        <section className="stack">
          {showAll ? (
            <div className={styles.toolbarTop}>
              <button type="button" className={styles.backBtn} onClick={() => setShowAll(false)}>
                ← My Rides
              </button>
            </div>
          ) : (
            <div className="section-header">
              <div className="section-title-row">
                <h2>My Rides</h2>
                {myRides.length > 0 && <span className="section-count">{myRides.length}</span>}
              </div>
              {myRides.length > 0 && (
                <button type="button" className={styles.backBtn} onClick={() => setShowAll(true)}>
                  See All
                </button>
              )}
            </div>
          )}

          {myRidesLoading && myRides.length === 0 ? (
            <div className="row">
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading…</span>
            </div>
          ) : myRides.length === 0 ? (
            <EmptyRidesState />
          ) : showAll ? (
            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  className={styles.search}
                  placeholder="Search by name or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className={styles.toolbarActions}>
                <div className={styles.toolbarLeft}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() =>
                      setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length])
                    }
                    title="Sort by date / name / status"
                  >
                    <ArrowUpDown className={styles.iconGlyph} aria-hidden="true" />
                    <span>{SORT_LABEL[sortBy]}</span>
                  </button>
                  <button
                    type="button"
                    className={
                      favoritesOnly ? `${styles.iconBtn} ${styles.heartActive}` : styles.iconBtn
                    }
                    onClick={() => setFavoritesOnly((v) => !v)}
                    aria-label="Show favorites only"
                  >
                    <Heart
                      className={styles.heartIcon}
                      aria-hidden="true"
                      fill={favoritesOnly ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <Link className={styles.addBtn} to="/events/new">
                  <Plus width={15} height={15} aria-hidden="true" />
                  Add
                </Link>
              </div>

              {filteredMyRidesByBucket.total === 0 ? (
                <p className={styles.noResults}>No rides match "{search}"</p>
              ) : (
                <div className={`stack ${styles.list}`}>
                  {filteredMyRidesByBucket.live.length > 0 && (
                    <>
                      <div className={styles.sectionLabel} data-tone="live">
                        Live now
                      </div>
                      {filteredMyRidesByBucket.live.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </>
                  )}
                  {filteredMyRidesByBucket.upcoming.length > 0 && (
                    <>
                      <div className={styles.sectionLabel}>Upcoming</div>
                      {filteredMyRidesByBucket.upcoming.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </>
                  )}
                  {filteredMyRidesByBucket.past.length > 0 && (
                    <>
                      <div className={styles.sectionLabel}>Past</div>
                      {filteredMyRidesByBucket.past.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.tileRow}>
              {homeRow.live.length > 0 && (
                <>
                  <div
                    className={`${styles.sectionLabel} ${styles.sectionLabelGrid}`}
                    data-tone="live"
                  >
                    Live now
                  </div>
                  {homeRow.live.map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </>
              )}
              {homeRow.upcoming.length > 0 && (
                <>
                  <div className={`${styles.sectionLabel} ${styles.sectionLabelGrid}`}>
                    Upcoming
                  </div>
                  {homeRow.upcoming.map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </>
              )}
              {homeRow.past.length > 0 && (
                <>
                  <div className={`${styles.sectionLabel} ${styles.sectionLabelGrid}`}>Past</div>
                  {homeRow.past.map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "findRides" && (
        <section className="stack">
          <div className="section-header">
            <div className="section-title-row">
              <h2>Find Rides</h2>
              {visibleFindRides.length > 0 && (
                <span className="section-count">{visibleFindRides.length}</span>
              )}
            </div>
            <div className={styles.toolbarLeft}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setFindShowSearch((v) => !v)}
                aria-label="Search rides"
              >
                <Search className={styles.iconGlyph} aria-hidden="true" />
              </button>
              <Link className={styles.addBtn} to="/events/new">
                <Plus width={15} height={15} aria-hidden="true" />
                Add
              </Link>
            </div>
          </div>

          {findShowSearch && (
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input
                className={styles.search}
                placeholder="Search by name or location…"
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
              />
            </div>
          )}

          <div className={styles.pillRow}>
            {FIND_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={item.value === findFilter ? styles.pillActive : styles.pill}
                onClick={() => setFindFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {otherError && (
            <p className="banner banner--error" role="alert">
              {otherError}
            </p>
          )}

          {otherLoading && otherRides.length === 0 ? (
            <div className="row">
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading…</span>
            </div>
          ) : visibleFindRides.length === 0 ? (
            <p className="muted">No rides here yet.</p>
          ) : (
            <div className="stack event-card-list">
              {visibleFindRides.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "track" && <TracksPage />}
    </div>
  );
}
