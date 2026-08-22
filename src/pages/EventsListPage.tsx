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
 * Four tabs, not sections stacked — a guest only ever sees "Invited"/"Find Rides"/"Track"
 * (there is nothing to show under "My Rides" without an account, and this app's rule is that a
 * sign-in prompt only ever lives in the drawer, never on this page):
 *   - "My Rides" — a toolbar (search, sort cycle, favourites filter, Add) over what this
 *     rider owns or joined. Home view shows a compact tile row; See All swaps to the full
 *     filtered/sorted list. Signed-in only.
 *   - "Invited" — events this rider was sent a join link/code for but hasn't joined yet (see
 *     store/invitedEventsStore.ts, populated by JoinPage.tsx). Renders InvitedEventsTab.tsx.
 *     Always present and public, same as Find Rides/Track, so a guest who opened a share link
 *     before registering still sees what they were invited to.
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

import {
  ArrowUpDown,
  Bike,
  CheckCircle2,
  Compass,
  Heart,
  Mail,
  Map as MapIcon,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EmptyRidesState } from "../app/EmptyRidesState";
import { EventCard } from "../app/EventCard";
import { EventTile } from "../app/EventTile";
import {
  consumeOpenedEventId,
  FIGMA_TAG_LABEL,
  type FigmaStatus,
  figmaStatus,
} from "../app/event-visuals";
import { InvitedEventsTab } from "../app/InvitedEventsTab";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { useEventsStore } from "../store/eventsStore";
import styles from "./EventsListPage.module.css";
import { TracksPage } from "./TracksPage";

type EventTab = "myRides" | "invited" | "findRides" | "track";

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
const SORT_LABEL: Record<SortKey, string> = {
  date: "Date",
  name: "Name",
  area: "Area",
};

// Home row: most recent My Rides only, before "See All" takes over.
const HOME_ROW_LIMIT = 10;

export function EventsListPage() {
  const { status } = useAuth();
  const authed = status === "signed-in";

  // EventCreatePage.tsx lands back here after a successful create (rather than on the new
  // event's own page, asked for directly) and hands the event id/name along in router state
  // so this banner can point straight at it instead of making the organizer hunt for it.
  const location = useLocation();
  const createdEvent = location.state as {
    createdEventId?: string;
    createdEventName?: string;
  } | null;
  const [createdBannerDismissed, setCreatedBannerDismissed] = useState(false);

  // The glowing "new" ring on that event's card fades after a few minutes on its own, same as
  // the banner staying up — asked for directly ("know its new at list for few minutes").
  const [newHighlightExpired, setNewHighlightExpired] = useState(false);
  useEffect(() => {
    if (!createdEvent?.createdEventId) return;
    const timer = setTimeout(() => setNewHighlightExpired(true), 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [createdEvent?.createdEventId]);
  const newEventId =
    createdEvent?.createdEventId && !newHighlightExpired ? createdEvent.createdEventId : null;

  // "the event we came from need glow shadow under for 10 seconds to know where we came from"
  // — whichever card was clicked into (EventCard.tsx/EventTile.tsx record it) lights up again
  // for 10s once this page remounts from a back navigation. Read once via a lazy initializer,
  // not an effect, so it's already known on the very first render — an effect would paint one
  // frame without the glow first.
  const [returnHighlightId, setReturnHighlightId] = useState<string | null>(() =>
    consumeOpenedEventId(),
  );
  useEffect(() => {
    if (!returnHighlightId) return;
    const timer = setTimeout(() => setReturnHighlightId(null), 10 * 1000);
    return () => clearTimeout(timer);
  }, [returnHighlightId]);

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
    // Date sort direction depends on the bucket — "rides are list top to bottom, the top is the
    // closest date," asked for directly. For Upcoming that's soonest-first (ascending); for
    // Past it's most-recent-first (descending), which IS the closest-to-today date for
    // something already behind you. Same direction the home row's own bucket sort
    // (myRidesByBucket above) already uses for Upcoming/Past — this just brings the See-All
    // list's "Date" sort into agreement with it, instead of always sorting newest-first
    // regardless of bucket.
    function comparator(bucket: "live" | "upcoming" | "past") {
      if (sortBy === "name") {
        return (a: EventSummary, b: EventSummary) => a.name.localeCompare(b.name);
      }
      if (sortBy === "area") {
        return (a: EventSummary, b: EventSummary) =>
          (a.location ?? "").localeCompare(b.location ?? "") ||
          timestamp(b.startsAt) - timestamp(a.startsAt);
      }
      return bucket === "upcoming"
        ? (a: EventSummary, b: EventSummary) => timestamp(a.startsAt) - timestamp(b.startsAt)
        : (a: EventSummary, b: EventSummary) => timestamp(b.startsAt) - timestamp(a.startsAt);
    }
    return {
      live: matches.filter((e) => figmaStatus(e.status) === "live").sort(comparator("live")),
      upcoming: matches
        .filter((e) => figmaStatus(e.status) === "upcoming")
        .sort(comparator("upcoming")),
      past: matches.filter((e) => figmaStatus(e.status) === "finished").sort(comparator("past")),
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
      {createdEvent?.createdEventId && !createdBannerDismissed && (
        <div className="banner banner--success" role="status">
          <span className="row" style={{ gap: 8 }}>
            <CheckCircle2 aria-hidden="true" />
            {createdEvent.createdEventName
              ? `"${createdEvent.createdEventName}" created.`
              : "Event created."}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <Link
              className="button button--quiet"
              to={`/events/${createdEvent.createdEventId}/participants`}
            >
              Add riders
            </Link>
            <Link className="button" to={`/events/${createdEvent.createdEventId}`}>
              View event
            </Link>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setCreatedBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <X aria-hidden="true" width={16} height={16} />
            </button>
          </span>
        </div>
      )}

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
          className={activeTab === "invited" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("invited")}
        >
          <Mail className={styles.tabIcon} aria-hidden="true" />
          Invited
        </button>
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
              <div className={styles.toolbarLeft}>
                {myRides.length > 0 && (
                  <button type="button" className={styles.backBtn} onClick={() => setShowAll(true)}>
                    See All
                  </button>
                )}
                <Link className={styles.addBtn} to="/events/new">
                  <Plus width={15} height={15} aria-hidden="true" />
                  Add
                </Link>
              </div>
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
                        <EventCard
                          key={event.id}
                          event={event}
                          isNew={event.id === newEventId}
                          justOpened={event.id === returnHighlightId}
                        />
                      ))}
                    </>
                  )}
                  {filteredMyRidesByBucket.upcoming.length > 0 && (
                    <>
                      <div className={styles.sectionLabel}>Upcoming</div>
                      {filteredMyRidesByBucket.upcoming.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          isNew={event.id === newEventId}
                          justOpened={event.id === returnHighlightId}
                        />
                      ))}
                    </>
                  )}
                  {filteredMyRidesByBucket.past.length > 0 && (
                    <>
                      <div className={styles.sectionLabel}>Past</div>
                      {filteredMyRidesByBucket.past.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          isNew={event.id === newEventId}
                          justOpened={event.id === returnHighlightId}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* "Upcoming" (large cards) and "Past Rides" (compact list), each with its own
               See All — matching a reference screenshot supplied directly, replacing the
               single mixed horizontal tile row this used to be. Both See All links open the
               same combined list below (still grouped by Live/Upcoming/Past there); splitting
               that into two fully separate searchable views wasn't asked for. */
            <div className={styles.sections}>
              {homeRow.live.length > 0 && (
                <div className={styles.cardSection}>
                  <div className="section-header">
                    <h3 className={styles.sectionHeading} data-tone="live">
                      Live now
                    </h3>
                  </div>
                  <div className={styles.cardList}>
                    {homeRow.live.map((event) => (
                      <EventTile
                        key={event.id}
                        event={event}
                        onToggleFavorite={handleToggleFavorite}
                        isNew={event.id === newEventId}
                        justOpened={event.id === returnHighlightId}
                      />
                    ))}
                  </div>
                </div>
              )}
              {homeRow.upcoming.length > 0 && (
                <div className={styles.cardSection}>
                  <div className="section-header">
                    <h3 className={styles.sectionHeading}>Upcoming</h3>
                    <button
                      type="button"
                      className={styles.seeAllLink}
                      onClick={() => setShowAll(true)}
                    >
                      See All
                    </button>
                  </div>
                  <div className={styles.cardList}>
                    {homeRow.upcoming.map((event) => (
                      <EventTile
                        key={event.id}
                        event={event}
                        onToggleFavorite={handleToggleFavorite}
                        isNew={event.id === newEventId}
                        justOpened={event.id === returnHighlightId}
                      />
                    ))}
                  </div>
                </div>
              )}
              {homeRow.past.length > 0 && (
                <div className={styles.cardSection}>
                  <div className="section-header">
                    <h3 className={styles.sectionHeading}>Past Rides</h3>
                    <button
                      type="button"
                      className={styles.seeAllLink}
                      onClick={() => setShowAll(true)}
                    >
                      See All
                    </button>
                  </div>
                  <div className={styles.cardList}>
                    {homeRow.past.map((event) => (
                      <EventTile
                        key={event.id}
                        event={event}
                        onToggleFavorite={handleToggleFavorite}
                        isNew={event.id === newEventId}
                        justOpened={event.id === returnHighlightId}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "invited" && <InvitedEventsTab />}

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
            <EmptyRidesState
              title="No rides here yet"
              subtitle="Be the first to add one, or join a ride with a code."
            />
          ) : (
            <div className="stack event-card-list">
              {visibleFindRides.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  justOpened={event.id === returnHighlightId}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "track" && <TracksPage />}
    </div>
  );
}
