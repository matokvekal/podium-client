/**
 * Home screen — the app opens here.
 *
 * Route:    /
 * Loads:    signed in: GET /events?filter=mine + GET /events?filter=joined (eventsStore keeps
 *           the merged list AND the joined-only id set). Everyone: GET /events/public
 *           (unauthenticated) for "Find Rides". See App.tsx > OpenHome.
 * Actions:  open a ride; create or join one (both require signing in first); My Rides
 *           Past/Current/Upcoming multi-select chips (none selected = all) + See All
 *           (search/sort/favourites); Find Rides
 *           client-side Filter + Sort (lib/find-rides-filter.ts).
 * State:    the active tab; My Rides chip filter + See-All controls; Find Rides criteria
 * Calls:    GET /events, GET /events/public
 *
 * Tabs depend on mode (store/userModeStore.ts):
 *   Rider     — My Rides | Find Rides
 *   Organizer — My Rides | Created | Find Rides
 *
 *   - "My Rides" — events this user PARTICIPATES in as a rider (filter=joined), whoever owns
 *     them. Same in both modes. Pending invitations (store/invitedEventsStore.ts — a join link
 *     opened but not yet joined) render at the TOP with an "Invited" marker; there is no
 *     separate Invited tab. Signed-in only.
 *   - "Created" (Organizer only) — every event this user owns (ownerId === me). An event can
 *     be in BOTH My Rides and Created — the tabs mean different relationships and are NOT
 *     deduped against each other.
 *   - "Find Rides" — the public discover list (RIDE-type only), genuinely *other* people's
 *     events (a ride already on this user's plate is filtered out). Filter/sort are 100%
 *     client-side over the loaded list — no filter endpoint exists.
 *
 * No "Find Races" tab and no "Find Tracks" tab here — the track planner lives in the side
 * menu / at /routes. RACE-type events still exist in the model and are reachable by link/code.
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
  Plus,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EmptyRidesState } from "../app/EmptyRidesState";
import { EventCard } from "../app/EventCard";
import { consumeOpenedEventId, figmaStatus } from "../app/event-visuals";
import { useAuth } from "../auth/AuthContext";
import { useConnectivityStore } from "../lib/connectivity";
import {
  activeFilterCount,
  applyFindRidesCriteria,
  DEFAULT_FIND_RIDES_CRITERIA,
  DIFFICULTY_LABEL,
  type DifficultyBucket,
  SORT_LABEL as FIND_SORT_LABEL,
  type FindRidesSort,
  WHEN_LABEL,
  type WhenFilter,
} from "../lib/find-rides-filter";
import type { EventSummary } from "../lib/local-db";
import { SURFACE_TYPE_ICON, SURFACE_TYPE_LABEL, type SurfaceType } from "../lib/surface-types";
import { useEventsStore } from "../store/eventsStore";
import { useInvitedEventsStore } from "../store/invitedEventsStore";
import { useIsOrganizer } from "../store/userModeStore";
import styles from "./EventsListPage.module.css";

// Rider sees: My Rides | Find Rides. Organizer also sees: Created (between them). No separate
// Invited tab — pending invites surface at the top of My Rides. No Find Tracks tab — that
// planner lives in the side menu / at /routes.
type EventTab = "myRides" | "created" | "findRides";

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
  area: "Area"
};

// Home row: most recent My Rides only, before "See All" takes over.
const HOME_ROW_LIMIT = 10;

/**
 * My Rides is split into Past / Current / Upcoming — plain client-side views over the
 * already-loaded list (GET /events?filter=mine + joined), no new request. Buckets come from
 * event-visuals.ts's figmaStatus, the same status logic the cards and the See-All view use:
 *   current   status is live
 *   upcoming  scheduled, not started
 *   past      finished / cancelled
 * (Find Rides has no status pills — it's for discovery by difficulty / date / type.)
 */
type MyRidesFilter = "past" | "current" | "upcoming";

const MY_RIDES_FILTERS: { value: MyRidesFilter; label: string }[] = [
  { value: "past", label: "Past" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
];

export function EventsListPage() {
  const { status, profile } = useAuth();
  const authed = status === "signed-in";
  // Rider mode drops the organizer surfaces: the "Add" (create event) buttons and the whole
  // "Find Tracks" tab (the route planner). "Find Rides" and all ride browsing stay — see
  // store/userModeStore.ts.
  const isOrganizer = useIsOrganizer();
  // Pending invitations (opened a join link, not joined yet — store/invitedEventsStore.ts).
  // No longer a tab: they surface at the top of My Rides with an INVITED marker.
  const invitesByEventId = useInvitedEventsStore((s) => s.byEventId);
  const pendingInvites = useMemo(
    () => Object.values(invitesByEventId).sort((a, b) => b.invitedAt - a.invitedAt),
    [invitesByEventId],
  );

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
    createdEvent?.createdEventId && !newHighlightExpired
      ? createdEvent.createdEventId
      : null;

  // "the event we came from need glow shadow under for 10 seconds to know where we came from"
  // — whichever card was clicked into (EventCard.tsx/EventTile.tsx record it) lights up again
  // for 10s once this page remounts from a back navigation. Read once via a lazy initializer,
  // not an effect, so it's already known on the very first render — an effect would paint one
  // frame without the glow first.
  const [returnHighlightId, setReturnHighlightId] = useState<string | null>(
    () => consumeOpenedEventId()
  );
  useEffect(() => {
    if (!returnHighlightId) return;
    const timer = setTimeout(() => setReturnHighlightId(null), 10 * 1000);
    return () => clearTimeout(timer);
  }, [returnHighlightId]);

  const [activeTab, setActiveTab] = useState<EventTab>(
    authed ? "myRides" : "findRides"
  );
  // A guest (or a session that just expired) can't be on My Rides / Created — Find Rides is
  // public. And "Created" only exists in Organizer mode.
  useEffect(() => {
    if (!authed && activeTab !== "findRides") {
      setActiveTab("findRides");
    } else if (activeTab === "created" && !isOrganizer) {
      setActiveTab("myRides");
    }
  }, [authed, activeTab, isOrganizer]);

  const rawMyRides = useEventsStore((state) => state.myRides);
  const joinedRideIds = useEventsStore((state) => state.joinedRideIds);
  // "My Rides" = events this user PARTICIPATES in as a rider (GET /events?filter=joined),
  // regardless of who owns them — identical in both modes. Falls back to the full merged list
  // only when we don't yet know the joined set (offline cold start). See eventsStore.ts.
  const myRides = useMemo(() => {
    if (joinedRideIds.length === 0) return rawMyRides;
    const joined = new Set(joinedRideIds);
    return rawMyRides.filter((ride) => joined.has(ride.id));
  }, [rawMyRides, joinedRideIds]);
  // "Created" = events this user owns (Organizer mode only). Same ownerId check the rest of
  // the app uses for isOwner; an event can be in BOTH lists and that is correct.
  const createdRides = useMemo(
    () => rawMyRides.filter((ride) => profile != null && ride.ownerId === profile.id),
    [rawMyRides, profile],
  );
  const createdSorted = useMemo(() => {
    const rank = (e: EventSummary) =>
      figmaStatus(e.status) === "live" ? 0 : figmaStatus(e.status) === "upcoming" ? 1 : 2;
    return [...createdRides].sort(
      (a, b) => rank(a) - rank(b) || timestamp(a.startsAt) - timestamp(b.startsAt),
    );
  }, [createdRides]);
  const myRidesLoading = useEventsStore((state) => state.myRidesLoading);
  const otherRides = useEventsStore((state) => state.otherRides);
  const otherLoading = useEventsStore((state) => state.otherLoading);
  const otherError = useEventsStore((state) => state.otherError);
  const reconnectNonce = useConnectivityStore((s) => s.reconnectNonce);
  const loadMyRides = useEventsStore((state) => state.loadMyRides);
  const loadOtherRides = useEventsStore((state) => state.loadOtherRides);

  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // My Rides — owned + joined, merged. Only fetched while signed in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger, not a value this effect reads — it changes only when the server goes from unreachable to reachable, which is exactly when this should refetch.
  useEffect(() => {
    loadMyRides(authed);
    // reconnectNonce: re-pull My Rides when the server comes back, so the list refreshes out
    // of its cached state on its own.
  }, [authed, loadMyRides, reconnectNonce]);

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

  // The chip row's active buckets. Multi-select, checkbox-style: an EMPTY selection means
  // "show everything" (the view you land on), and tapping chips narrows to just the picked
  // buckets — tap Past to see only past, then add Upcoming to see both. Purely a client-side
  // lens over myRides — every chip shows rides that are already loaded, so toggling one never
  // triggers a fetch or a spinner.
  const [myFilters, setMyFilters] = useState<MyRidesFilter[]>([]);
  function toggleMyFilter(value: MyRidesFilter) {
    setMyFilters((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  // One flat, ordered list for the home view — the reference design shows a single stream of
  // cards, not the separate Live/Upcoming/Past sections this used to render. Order is always
  // live → upcoming → past; the chip selection only decides which of those blocks appear.
  const homeList = useMemo(() => {
    const { live, upcoming, past } = myRidesByBucket;
    const show = (bucket: MyRidesFilter) =>
      myFilters.length === 0 || myFilters.includes(bucket);
    const ordered = [
      ...(show("current") ? live : []),
      ...(show("upcoming") ? upcoming : []),
      ...(show("past") ? past : []),
    ];
    return ordered.slice(0, HOME_ROW_LIMIT);
  }, [myRidesByBucket, myFilters]);

  // See-All list: search + favourites filter first, then bucketed the same way as the home
  // row, with the chosen sort applied inside each bucket (Live is small enough that its own
  // order doesn't matter much, but stays consistent by using the same comparator).
  const q = search.trim().toLowerCase();
  const filteredMyRidesByBucket = useMemo(() => {
    const matches = myRides.filter((event) => {
      if (favoritesOnly && !event.favorite) return false;
      if (!q) return true;
      return (
        event.name.toLowerCase().includes(q) ||
        (event.location ?? "").toLowerCase().includes(q)
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
        return (a: EventSummary, b: EventSummary) =>
          a.name.localeCompare(b.name);
      }
      if (sortBy === "area") {
        return (a: EventSummary, b: EventSummary) =>
          (a.location ?? "").localeCompare(b.location ?? "") ||
          timestamp(b.startsAt) - timestamp(a.startsAt);
      }
      return bucket === "upcoming"
        ? (a: EventSummary, b: EventSummary) =>
            timestamp(a.startsAt) - timestamp(b.startsAt)
        : (a: EventSummary, b: EventSummary) =>
            timestamp(b.startsAt) - timestamp(a.startsAt);
    }
    return {
      live: matches
        .filter((e) => figmaStatus(e.status) === "live")
        .sort(comparator("live")),
      upcoming: matches
        .filter((e) => figmaStatus(e.status) === "upcoming")
        .sort(comparator("upcoming")),
      past: matches
        .filter((e) => figmaStatus(e.status) === "finished")
        .sort(comparator("past")),
      total: matches.length
    };
  }, [myRides, q, favoritesOnly, sortBy]);

  // Find Rides — the public list, identical for everyone, RIDE-type only (see the doc comment
  // above re: no Find Races tab). Fetched once; ALL filtering + sorting is client-side over the
  // events already loaded — see lib/find-rides-filter.ts. No status pills here — "live /
  // upcoming / finished" is a My Rides concern; Find Rides is for discovery.
  const [findShowSearch, setFindShowSearch] = useState(false);
  const [findSearch, setFindSearch] = useState("");
  const [findFilterOpen, setFindFilterOpen] = useState(false);
  const [findSortOpen, setFindSortOpen] = useState(false);
  const [findDifficulty, setFindDifficulty] = useState<DifficultyBucket[]>([]);
  const [findSurface, setFindSurface] = useState<SurfaceType[]>([]);
  const [findWhen, setFindWhen] = useState<WhenFilter>("any");
  const [findSort, setFindSort] = useState<FindRidesSort>(DEFAULT_FIND_RIDES_CRITERIA.sort);

  const findCriteria = useMemo(
    () => ({
      search: findSearch,
      difficulty: findDifficulty,
      surface: findSurface,
      when: findWhen,
      sort: findSort,
    }),
    [findSearch, findDifficulty, findSurface, findWhen, findSort],
  );
  const findActiveFilters = activeFilterCount(findCriteria);

  function toggleFindDifficulty(bucket: DifficultyBucket) {
    setFindDifficulty((current) =>
      current.includes(bucket) ? current.filter((b) => b !== bucket) : [...current, bucket],
    );
  }
  function toggleFindSurface(surface: SurfaceType) {
    setFindSurface((current) =>
      current.includes(surface) ? current.filter((s) => s !== surface) : [...current, surface],
    );
  }
  function clearFindFilters() {
    setFindDifficulty([]);
    setFindSurface([]);
    setFindWhen("any");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectNonce is a deliberate re-run trigger, not a value this effect reads — it changes only when the server goes from unreachable to reachable, which is exactly when this should refetch.
  useEffect(() => {
    loadOtherRides();
  }, [loadOtherRides, reconnectNonce]);

  // Full set (incl. created events) — so Find Rides never lists something already on this
  // rider's plate, even one they own but aren't in Rider-mode "My Rides".
  const myRideIds = useMemo(
    () => new Set(rawMyRides.map((event) => event.id)),
    [rawMyRides]
  );

  const visibleFindRides = useMemo(() => {
    const base = otherRides.filter(
      (event) => event.type === "RIDE" && (!authed || !myRideIds.has(event.id)),
    );
    return applyFindRidesCriteria(base, findCriteria);
  }, [otherRides, authed, myRideIds, findCriteria]);

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
            {myRides.length > 0 && <span className={styles.tabCount}>{myRides.length}</span>}
          </button>
        )}
        {authed && isOrganizer && (
          <button
            type="button"
            className={activeTab === "created" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("created")}
          >
            <Plus className={styles.tabIcon} aria-hidden="true" />
            Created
            {createdRides.length > 0 && (
              <span className={styles.tabCount}>{createdRides.length}</span>
            )}
          </button>
        )}
        <button
          type="button"
          className={activeTab === "findRides" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("findRides")}
        >
          <Compass className={styles.tabIcon} aria-hidden="true" />
          Find Rides
          {visibleFindRides.length > 0 && (
            <span className={styles.tabCount}>{visibleFindRides.length}</span>
          )}
        </button>
      </div>

      {activeTab === "myRides" && authed && (
        <section className="stack">
          {showAll ? (
            <div className={styles.toolbarTop}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setShowAll(false)}
              >
                ← My Rides
              </button>
            </div>
          ) : (
            <div className="section-header">
              <div className="section-title-row">
                <h2>My Rides</h2>
                {myRides.length > 0 && (
                  <span className="section-count">{myRides.length}</span>
                )}
              </div>
              <div className={styles.toolbarLeft}>
                {myRides.length > 0 && (
                  <button
                    type="button"
                    className={styles.seeAllLink}
                    onClick={() => setShowAll(true)}
                  >
                    See All
                  </button>
                )}
                {isOrganizer && (
                  <Link className={styles.addBtn} to="/events/new">
                    <Plus width={15} height={15} aria-hidden="true" />
                    Add
                  </Link>
                )}
              </div>
            </div>
          )}

          {!showAll && pendingInvites.length > 0 && (
            <div className={styles.inviteBlock}>
              {pendingInvites.map((invite) => (
                <Link
                  key={invite.eventId}
                  to={`/join/${invite.code}`}
                  className={styles.inviteCard}
                >
                  <span className={styles.inviteBadge}>Invited</span>
                  <span className={styles.inviteName}>{invite.name}</span>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    Pending invitation · {invite.type === "RACE" ? "Race" : "Ride"} — tap to view
                  </span>
                </Link>
              ))}
            </div>
          )}

          {myRidesLoading && myRides.length === 0 ? (
            <div className="row">
              <span className="spinner" aria-hidden="true" />
              <span className="muted">Loading…</span>
            </div>
          ) : myRides.length === 0 ? (
            pendingInvites.length > 0 ? (
              <p className={styles.noResults}>
                No rides yet — open an invitation above to join one.
              </p>
            ) : (
              <EmptyRidesState />
            )
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
                      setSortBy(
                        SORT_CYCLE[
                          (SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length
                        ]
                      )
                    }
                    title="Sort by date / name / status"
                  >
                    <ArrowUpDown
                      className={styles.iconGlyph}
                      aria-hidden="true"
                    />
                    <span>{SORT_LABEL[sortBy]}</span>
                  </button>
                  <button
                    type="button"
                    className={
                      favoritesOnly
                        ? `${styles.iconBtn} ${styles.heartActive}`
                        : styles.iconBtn
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
                {isOrganizer && (
                  <Link className={styles.addBtn} to="/events/new">
                    <Plus width={15} height={15} aria-hidden="true" />
                    Add
                  </Link>
                )}
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
            /* The reference design's My Rides view: one filter chip row over a single flat
               stream of full cards. This replaces the old separate Live now / Upcoming / Past
               Rides sections of compact EventTiles — same rides, same order, one list. The
               previous version is in src/_backup-pre-newui/EventsListPage.tsx.bak. */
            <div className={styles.sections}>
              <div className={styles.filterChips}>
                <div className={styles.filterChipGroup}>
                  {MY_RIDES_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={styles.filterChip}
                      data-on={myFilters.includes(f.value)}
                      aria-pressed={myFilters.includes(f.value)}
                      onClick={() => toggleMyFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* The reference puts a controls glyph at the end of the chip row. It opens the
                    search / sort / favourites toolbar, which already exists as the See-All
                    view — rather than inventing a second, parallel filter surface. */}
                <button
                  type="button"
                  className={styles.filterChipIcon}
                  onClick={() => setShowAll(true)}
                  aria-label="Search and sort rides"
                  title="Search and sort"
                >
                  <SlidersHorizontal width={16} height={16} aria-hidden="true" />
                </button>
              </div>

              {homeList.length === 0 ? (
                <p className={styles.noResults}>
                  {myFilters.length === 0
                    ? "No rides yet."
                    : myFilters.length === 1 && myFilters[0] === "current"
                      ? "No rides happening right now."
                      : myFilters.length === 1 && myFilters[0] === "past"
                        ? "No past rides yet."
                        : myFilters.length === 1 && myFilters[0] === "upcoming"
                          ? "No upcoming rides."
                          : "No rides match the selected filters."}
                </p>
              ) : (
                <div className={styles.homeList}>
                  {homeList.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      isNew={event.id === newEventId}
                      justOpened={event.id === returnHighlightId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "created" && authed && isOrganizer && (
        <section className="stack">
          <div className="section-header">
            <div className="section-title-row">
              <h2>Created</h2>
              {createdRides.length > 0 && (
                <span className="section-count">{createdRides.length}</span>
              )}
            </div>
            <Link className={styles.addBtn} to="/events/new">
              <Plus width={15} height={15} aria-hidden="true" />
              Add
            </Link>
          </div>
          {createdRides.length === 0 ? (
            <EmptyRidesState
              title="Nothing created yet"
              subtitle="Create a ride or race — it'll show up here to manage."
            />
          ) : (
            <div className={styles.homeList}>
              {createdSorted.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isNew={event.id === newEventId}
                  justOpened={event.id === returnHighlightId}
                />
              ))}
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
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setFindFilterOpen(true)}
                aria-label="Filter rides"
              >
                <SlidersHorizontal className={styles.iconGlyph} aria-hidden="true" />
                {findActiveFilters > 0 && (
                  <span className={styles.tabCount}>{findActiveFilters}</span>
                )}
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setFindSortOpen(true)}
                aria-label="Sort rides"
              >
                <ArrowUpDown className={styles.iconGlyph} aria-hidden="true" />
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

          {findActiveFilters > 0 && (
            <div className={styles.activeFilters}>
              {findDifficulty.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  className={styles.activeFilterChip}
                  onClick={() => toggleFindDifficulty(bucket)}
                >
                  {DIFFICULTY_LABEL[bucket]}
                  <X width={12} height={12} aria-hidden="true" />
                </button>
              ))}
              {findSurface.map((surface) => (
                <button
                  key={surface}
                  type="button"
                  className={styles.activeFilterChip}
                  onClick={() => toggleFindSurface(surface)}
                >
                  {SURFACE_TYPE_LABEL[surface]}
                  <X width={12} height={12} aria-hidden="true" />
                </button>
              ))}
              {findWhen !== "any" && (
                <button
                  type="button"
                  className={styles.activeFilterChip}
                  onClick={() => setFindWhen("any")}
                >
                  {WHEN_LABEL[findWhen]}
                  <X width={12} height={12} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className={styles.clearFiltersBtn}
                onClick={clearFindFilters}
              >
                Clear filters
              </button>
            </div>
          )}

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
            findActiveFilters > 0 || findSearch.trim() ? (
              <p className={styles.noResults}>
                No rides match those filters.{" "}
                <button
                  type="button"
                  className={styles.inlineLink}
                  onClick={() => {
                    clearFindFilters();
                    setFindSearch("");
                  }}
                >
                  Clear
                </button>
              </p>
            ) : (
              <EmptyRidesState
                title="No rides here yet"
                subtitle="Be the first to add one, or join a ride with a code."
              />
            )
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

          {(findFilterOpen || findSortOpen) && (
            <div
              className={styles.sheetOverlay}
              onClick={() => {
                setFindFilterOpen(false);
                setFindSortOpen(false);
              }}
              aria-hidden="true"
            />
          )}

          <div className={findFilterOpen ? `${styles.sheet} ${styles.sheetOpen}` : styles.sheet}>
            <div className={styles.sheetHeader}>
              <h2 style={{ margin: 0 }}>Filter</h2>
              <div className="row">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={clearFindFilters}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setFindFilterOpen(false)}
                  aria-label="Close filter"
                >
                  <X width={18} height={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className={`stack ${styles.sheetBody}`}>
              <div className={styles.sheetGroup}>
                <span className={styles.sheetGroupLabel}>Difficulty</span>
                <div className={styles.sheetChips}>
                  {(["easy", "medium", "hard"] as const).map((bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      className={styles.filterChip}
                      data-on={findDifficulty.includes(bucket)}
                      aria-pressed={findDifficulty.includes(bucket)}
                      onClick={() => toggleFindDifficulty(bucket)}
                    >
                      {DIFFICULTY_LABEL[bucket]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sheetGroup}>
                <span className={styles.sheetGroupLabel}>When</span>
                <div className={styles.sheetChips}>
                  {(["any", "today", "week", "month"] as const).map((when) => (
                    <button
                      key={when}
                      type="button"
                      className={styles.filterChip}
                      data-on={findWhen === when}
                      aria-pressed={findWhen === when}
                      onClick={() => setFindWhen(when)}
                    >
                      {when === "any" ? "Anytime" : WHEN_LABEL[when]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sheetGroup}>
                <span className={styles.sheetGroupLabel}>Type</span>
                <div className={styles.sheetChips}>
                  {(Object.keys(SURFACE_TYPE_LABEL) as SurfaceType[]).map((surface) => {
                    const Icon = SURFACE_TYPE_ICON[surface];
                    return (
                      <button
                        key={surface}
                        type="button"
                        className={styles.filterChip}
                        data-on={findSurface.includes(surface)}
                        aria-pressed={findSurface.includes(surface)}
                        onClick={() => toggleFindSurface(surface)}
                      >
                        <Icon width={13} height={13} aria-hidden="true" />
                        {SURFACE_TYPE_LABEL[surface]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                className="button"
                onClick={() => setFindFilterOpen(false)}
              >
                Show {visibleFindRides.length} ride{visibleFindRides.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>

          <div className={findSortOpen ? `${styles.sheet} ${styles.sheetOpen}` : styles.sheet}>
            <div className={styles.sheetHeader}>
              <h2 style={{ margin: 0 }}>Sort</h2>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setFindSortOpen(false)}
                aria-label="Close sort"
              >
                <X width={18} height={18} aria-hidden="true" />
              </button>
            </div>
            <div className={`stack ${styles.sheetBody}`}>
              {(Object.keys(FIND_SORT_LABEL) as FindRidesSort[]).map((sort) => (
                <button
                  key={sort}
                  type="button"
                  className={styles.sortoption}
                  data-on={findSort === sort}
                  onClick={() => {
                    setFindSort(sort);
                    setFindSortOpen(false);
                  }}
                >
                  {FIND_SORT_LABEL[sort]}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
