/**
 * BUILD A TRACK — /build
 *
 * Draw a bike route on the map: tap to add points, the route follows roads (Road) or trails
 * (Off-road) between them, drag to fix it, Undo when it goes wrong. Then ride it, save it to My
 * Tracks, or download a GPX.
 *
 * Built for no instructions and few taps. The map is the whole screen; the only always-visible
 * controls are search, Road/Off-road, the distance, Undo/Redo and one bottom bar. Selecting a
 * point swaps the bottom bar for that point's actions.
 *
 * Where things live:
 *   model.ts         the route as data (waypoints + segments) and every edit
 *   store.ts         the draft and its undo history
 *   routingQueue.ts  asks the server to route pending segments (debounced, cancellable)
 *   draftStorage.ts  the one draft kept on this device (localStorage)
 *   BuilderMap.tsx   Leaflet, lazy-loaded
 *
 * Saving uses the existing endpoints: POST /routes for My Tracks, and "Ride it now" hands the
 * line to the ride form (/events/new) the same way an uploaded GPX does — the ride form posts
 * it with the ride, and nothing is added to My Tracks.
 */

import {
  ArrowLeft,
  Bike,
  Download,
  Flag,
  Loader2,
  LocateFixed,
  Mountain,
  PenLine,
  Play,
  Redo2,
  Repeat,
  Save,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiMutate, apiRequest } from "../lib/api-client";
import { simplifyIndicesToCount } from "../lib/geo";
import { type PlaceResult, searchPlaces } from "../lib/ride-stops";
import { buildGpxFile, downloadGpxFile, gpxFilenameFor, parseTrackGpx } from "../lib/track-gpx";
import { trackSharePath } from "../lib/track-share-url";
import { useIsOrganizer } from "../store/userModeStore";
import type { MapFocus, MapView } from "./BuilderMap";
import { clearDraft, loadDraft, loadView, saveDraft, saveView } from "./draftStorage";
import {
  addWaypoint,
  applyRouted,
  applyRoutingError,
  canCloseLoop,
  closeLoop,
  draftStats,
  draftToEventRoute,
  emptyDraft,
  importTrack,
  insertOnSegment,
  isDraftComplete,
  type LatLng,
  moveWaypoint,
  type RouteDraft,
  type RoutingProfile,
  removeWaypoint,
  renameDraft,
  retrySegment,
  setManual,
  setProfile,
  setSegmentMode,
} from "./model";
import styles from "./RouteBuilderPage.module.css";
import { fetchSegmentFromServer, RoutingQueue } from "./routingQueue";
import { useRouteBuilderStore } from "./store";

const BuilderMap = lazy(() => import("./BuilderMap"));

/** The ride form's limit (POST /events/:id/route). Thinned only when over it, keeping corners. */
const RIDE_ROUTE_MAX_POINTS = 5000;
/** POST /routes's limit. A file over it is thinned on import, and the rider is told. */
const LIBRARY_MAX_POINTS = 50_000;
const MAX_GPX_BYTES = 20 * 1024 * 1024;

/** What "Ride it now" puts in router state for EventCreatePage. */
export interface BuilderRouteHandoff {
  builderRoute: ReturnType<typeof draftToEventRoute>;
  builderName: string;
  builderProfile: RoutingProfile;
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? km.toFixed(2) : km.toFixed(1);
}

function vibrate() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Haptics are a nicety.
  }
}

/**
 * Opened from the ride form ("Create a New Route"): the builder lies over the form, which stays
 * mounted with everything already typed. "Use this route" hands the line back; Back closes the
 * builder without attaching anything. The draft is the same one /build uses.
 */
export interface BuilderForRide {
  onUse(handoff: BuilderRouteHandoff): void;
  onCancel(): void;
}

export function RouteBuilderPage({ forRide }: { forRide?: BuilderForRide } = {}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOrganizer = useIsOrganizer();
  const canRide = forRide != null || (isOrganizer && profile?.canOrganize !== false);

  const draft = useRouteBuilderStore((s) => s.draft);
  const canUndo = useRouteBuilderStore((s) => s.past.length > 0);
  const canRedo = useRouteBuilderStore((s) => s.future.length > 0);
  const { edit, patch, reset, undo, redo } = useRouteBuilderStore.getState();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routingEnabled, setRoutingEnabled] = useState(true);
  const [storageProblem, setStorageProblem] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const viewRef = useRef<MapView | null>(null);
  const [initialView] = useState(() => loadView());

  // ---- restore, persist ----------------------------------------------------------------------

  // A draft left on this device comes straight back — no "continue?" question in the way. It
  // says so, with Start over right there.
  const [restoreChecked, setRestoreChecked] = useState(false);
  useEffect(() => {
    if (useRouteBuilderStore.getState().draft.waypoints.length === 0) {
      const stored = loadDraft();
      if (stored && stored.draft.waypoints.length > 0) {
        reset(stored.draft);
        setResumed(true);
      }
    }
    setRestoreChecked(true);
  }, [reset]);

  useEffect(() => {
    if (!restoreChecked) return;
    const timer = window.setTimeout(() => {
      const result = saveDraft(draft);
      setStorageProblem(!result.ok);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, restoreChecked]);

  // ---- routing -------------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ routingEnabled: boolean }>("/route-builder/config", { anonymous: true })
      .then((cfg) => {
        if (!cancelled) setRoutingEnabled(cfg.routingEnabled);
      })
      .catch(() => {
        // Unknown: keep trying to route; a failed segment explains itself.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const queueRef = useRef<RoutingQueue | null>(null);
  useEffect(() => {
    const queue = new RoutingQueue({
      fetchSegment: fetchSegmentFromServer,
      onResult: (id, key, routed) => patch((d) => applyRouted(d, id, key, routed)),
      onError: (id, key, message) => patch((d) => applyRoutingError(d, id, key, message)),
    });
    queueRef.current = queue;
    queue.sync(useRouteBuilderStore.getState().draft);
    const unsubscribe = useRouteBuilderStore.subscribe((state, prev) => {
      if (state.draft !== prev.draft) queue.sync(state.draft);
    });
    return () => {
      unsubscribe();
      queue.dispose();
    };
  }, [patch]);

  // ---- map gestures --------------------------------------------------------------------------

  const onMapTap = useCallback(
    (position: LatLng) => {
      if (selectedId) {
        // First tap after selecting a point just closes its actions — never a surprise point.
        setSelectedId(null);
        return;
      }
      setResumed(false);
      edit((d) => addWaypoint(d, position));
      vibrate();
    },
    [selectedId, edit],
  );

  const onWaypointMoved = useCallback(
    (id: string, position: LatLng) => edit((d) => moveWaypoint(d, id, position)),
    [edit],
  );

  const onSegmentTap = useCallback(
    (segmentId: string, position: LatLng) => {
      const before = useRouteBuilderStore.getState().draft;
      edit((d) => insertOnSegment(d, segmentId, position));
      const after = useRouteBuilderStore.getState().draft;
      if (after !== before) {
        // Select the new point so it is obvious where it went and that it can be dragged. On an
        // imported line anchors are added too; the selected one is the point nearest the tap.
        const added = after.waypoints.filter((w) => !before.waypoints.some((b) => b.id === w.id));
        const dist = (p: LatLng) => (p[0] - position[0]) ** 2 + (p[1] - position[1]) ** 2;
        added.sort((a, b) => dist(a.position) - dist(b.position));
        setSelectedId(added[0]?.id ?? null);
        vibrate();
      }
    },
    [edit],
  );

  const onViewChange = useCallback((view: MapView) => {
    viewRef.current = view;
    saveView({ center: view.center, zoom: view.zoom });
  }, []);

  // Desktop keyboard: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y, Delete for the selected point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        edit((d) => removeWaypoint(d, selectedId));
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setFinishOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, edit, selectedId]);

  // A selected point that undo removed is no longer selected.
  useEffect(() => {
    if (selectedId && !draft.waypoints.some((w) => w.id === selectedId)) setSelectedId(null);
  }, [draft.waypoints, selectedId]);

  // ---- derived -------------------------------------------------------------------------------

  const stats = useMemo(() => draftStats(draft), [draft]);
  const complete = isDraftComplete(draft);
  const failedSegment = draft.segments.find((s) => s.status === "error") ?? null;
  const selectedIndex = draft.waypoints.findIndex((w) => w.id === selectedId);
  const nextSegment = selectedIndex >= 0 ? draft.segments[selectedIndex] : undefined;
  const pointCount = draft.waypoints.length;

  const hint =
    pointCount === 0
      ? "Tap the map to set your start"
      : pointCount === 1
        ? !draft.manual
          ? "Tap where you want to ride to"
          : "Tap the next point"
        : pointCount === 2 && !resumed
          ? "Drag a point to adjust · tap the line to add one"
          : null;

  // ---- search --------------------------------------------------------------------------------

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const lastSearchAt = useRef(0);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text || searching) return;
    // Nominatim allows one request a second; a double-tap on Search waits rather than fails.
    const wait = 1000 - (Date.now() - lastSearchAt.current);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSearchAt.current = Date.now();
    setSearching(true);
    setSearchError(null);
    try {
      // Rank places near the route first, else near what is on screen. A preference only.
      const near: LatLng[] = draft.waypoints.length
        ? draft.waypoints.map((w) => w.position)
        : viewRef.current
          ? viewRef.current.bounds
          : [];
      const found = await searchPlaces(text, near);
      setResults(found);
      if (found.length === 0)
        setSearchError("Nothing found — try another spelling or a nearby town.");
    } catch {
      setResults(null);
      setSearchError("Search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  function pickPlace(result: PlaceResult) {
    setResults(null);
    setPlace(result);
    setFocus({ nonce: Date.now(), point: [result.lat, result.lng], bbox: result.bbox });
  }

  function addPlace() {
    if (!place) return;
    edit((d) => addWaypoint(d, [place.lat, place.lng]));
    vibrate();
    setPlace(null);
    setQuery("");
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setNotice("Location is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFocus({ nonce: Date.now(), point: [pos.coords.latitude, pos.coords.longitude] }),
      () => setNotice("Couldn't get your location."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // ---- import --------------------------------------------------------------------------------

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function importFile(file: File) {
    if (file.size > MAX_GPX_BYTES) {
      setNotice("That file is too large (over 20 MB).");
      return;
    }
    const parsed = parseTrackGpx(await file.text());
    if (!parsed) {
      setNotice("Couldn't read a track from that file. Is it a GPX?");
      return;
    }
    let { points } = parsed;
    let elevations = parsed.elevations;
    if (points.length > LIBRARY_MAX_POINTS) {
      const step = Math.ceil(points.length / LIBRARY_MAX_POINTS);
      const keep = points.map((_, i) => i).filter((i) => i % step === 0 || i === points.length - 1);
      points = keep.map((i) => points[i]);
      elevations = elevations ? keep.map((i) => elevations?.[i] ?? null) : null;
      setNotice(
        `This file had ${parsed.points.length.toLocaleString()} points; kept every ${step}${step === 2 ? "nd" : "th"} so it can be saved.`,
      );
    }
    const name = file.name.replace(/\.gpx$/i, "");
    // An edit, not a reset: Undo brings back whatever was on the map before the import.
    edit((d) => importTrack(d.profile, points, elevations, name));
    setSelectedId(null);
    setResumed(false);
    setFocus({ nonce: Date.now(), point: points[0], bbox: bboxOf(points) });
  }

  // ---- finish --------------------------------------------------------------------------------

  // An edit, so Undo brings the track back; the emptied draft also clears storage.
  function startOver() {
    edit((d) => emptyDraft(d.profile));
    setSelectedId(null);
    setResumed(false);
    setFinishOpen(false);
  }

  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.map} />}>
        {restoreChecked && (
          <BuilderMap
            draft={draft}
            selectedId={selectedId}
            initialView={initialView}
            focus={focus}
            routingAttribution={routingEnabled}
            onMapTap={onMapTap}
            onWaypointTap={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            onWaypointMoved={onWaypointMoved}
            onSegmentTap={onSegmentTap}
            onViewChange={onViewChange}
          />
        )}
      </Suspense>

      {/* ---- top: back, search, profile, distance ---- */}
      <div className={styles.top}>
        <div className={styles.searchRow}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Back"
            onClick={() => {
              if (forRide) forRide.onCancel();
              else if (window.history.length > 1) navigate(-1);
              else navigate("/findtracks");
            }}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <form className={styles.search} onSubmit={runSearch}>
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Search a place · חיפוש מקום"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search for a place"
            />
            <button type="submit" aria-label="Search" disabled={searching || !query.trim()}>
              {searching ? (
                <Loader2 className={styles.spin} aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
            </button>
          </form>
        </div>

        {results && results.length > 0 && (
          <ul className={styles.results}>
            {results.map((r) => (
              <li key={`${r.lat},${r.lng},${r.name}`}>
                <button type="button" onClick={() => pickPlace(r)}>
                  {r.name}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={styles.resultsClose}
                onClick={() => setResults(null)}
              >
                Close
              </button>
            </li>
          </ul>
        )}
        {searchError && (
          <button type="button" className={styles.chip} onClick={() => setSearchError(null)}>
            {searchError} <X aria-hidden="true" />
          </button>
        )}

        <div className={styles.statusRow}>
          {
            <div className={styles.segmented}>
              <button
                type="button"
                aria-pressed={draft.profile === "road"}
                onClick={() => edit((d) => setProfile(d, "road"))}
              >
                <Bike aria-hidden="true" /> Road
              </button>
              <button
                type="button"
                aria-pressed={draft.profile === "mtb"}
                onClick={() => edit((d) => setProfile(d, "mtb"))}
              >
                <Mountain aria-hidden="true" /> Off-road
              </button>
            </div>
          }
          {draft.segments.length > 0 && (
            <output className={styles.stats} aria-live="polite">
              <strong>{formatKm(stats.distanceM)} km</strong>
              {stats.climbM != null && stats.climbM > 0 && (
                <span>↗ {Math.round(stats.climbM)} m</span>
              )}
              {stats.pending > 0 && <Loader2 className={styles.spin} aria-label="Routing…" />}
            </output>
          )}
        </div>
      </div>

      {/* ---- right: undo / redo / locate ---- */}
      <div className={styles.side}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="My location"
          onClick={locateMe}
        >
          <LocateFixed aria-hidden="true" />
        </button>
      </div>

      {/* ---- desktop: the point list ---- */}
      {pointCount > 0 && (
        <aside className={styles.panel} aria-label="Points">
          <ol>
            {draft.waypoints.map((w, i) => (
              <li key={w.id} className={w.id === selectedId ? styles.panelSelected : undefined}>
                <button type="button" onClick={() => setSelectedId(w.id)}>
                  {i === 0 ? "Start" : i === pointCount - 1 ? "End" : `Point ${i}`}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${i === 0 ? "start" : i === pointCount - 1 ? "end" : `point ${i}`}`}
                  onClick={() => edit((d) => removeWaypoint(d, w.id))}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {/* ---- bottom: messages, then the bar ---- */}
      <div className={styles.bottom}>
        {hint && !place && <p className={styles.hint}>{hint}</p>}

        {resumed && pointCount > 0 && (
          <div className={styles.banner}>
            <span>Continuing your track</span>
            <button type="button" onClick={startOver}>
              Start over
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setResumed(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}

        {place && (
          <div className={styles.banner}>
            <span className={styles.placeName}>{place.name.split(",")[0]}</span>
            <button type="button" className={styles.primarySmall} onClick={addPlace}>
              + Add as point
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setPlace(null)}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}

        {failedSegment && (
          <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
            <span>{failedSegment.error ?? "No route here."}</span>
            <button
              type="button"
              onClick={() => edit((d) => setSegmentMode(d, failedSegment.id, "manual"))}
            >
              Draw straight
            </button>
            <button type="button" onClick={() => patch((d) => retrySegment(d, failedSegment.id))}>
              Retry
            </button>
          </div>
        )}

        {/* Never a silent fallback: without routing the rider is told, and every leg that
            cannot be routed shows its own error with "Draw straight" as an explicit choice. */}
        {!routingEnabled && (
          <p className={`${styles.note} ${styles.noteError}`} role="alert">
            Automatic routing is unavailable right now. You can still draw straight lines (✏️
            Straight).
          </p>
        )}
        {storageProblem && (
          <p className={styles.note} role="alert">
            This track is too large to keep after a refresh — download the GPX to be safe.
          </p>
        )}
        {notice && (
          <button type="button" className={styles.chip} onClick={() => setNotice(null)}>
            {notice} <X aria-hidden="true" />
          </button>
        )}

        {selectedIndex >= 0 ? (
          <div className={styles.bar}>
            <span className={styles.barLabel}>
              {selectedIndex === 0
                ? "Start"
                : selectedIndex === pointCount - 1
                  ? "End"
                  : `Point ${selectedIndex}`}
            </span>
            {nextSegment && (
              <button
                type="button"
                onClick={() =>
                  edit((d) =>
                    setSegmentMode(
                      d,
                      nextSegment.id,
                      nextSegment.mode === "manual" ? "routed" : "manual",
                    ),
                  )
                }
              >
                <PenLine aria-hidden="true" />
                {nextSegment.mode === "manual" ? "Follow roads to next" : "Straight to next"}
              </button>
            )}
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                edit((d) => removeWaypoint(d, selectedId as string));
                setSelectedId(null);
              }}
            >
              <Trash2 aria-hidden="true" /> Delete
            </button>
            <button type="button" onClick={() => setSelectedId(null)}>
              Done
            </button>
          </div>
        ) : (
          <div className={styles.bar}>
            {
              <button
                type="button"
                aria-pressed={draft.manual}
                className={draft.manual ? styles.toggleOn : undefined}
                onClick={() => patch((d) => setManual(d, !d.manual))}
                title="New points connect with a straight line instead of following roads"
              >
                <PenLine aria-hidden="true" /> Straight
              </button>
            }
            <button type="button" disabled={!canCloseLoop(draft)} onClick={() => edit(closeLoop)}>
              <Repeat aria-hidden="true" /> Close loop
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" /> GPX
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={draft.segments.length === 0}
              onClick={() => setFinishOpen(true)}
            >
              <Flag aria-hidden="true" /> Finish
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,application/gpx+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>

      {finishOpen && (
        <FinishSheet
          draft={draft}
          complete={complete}
          pending={stats.pending}
          distanceM={stats.distanceM}
          climbM={stats.climbM}
          canRide={canRide}
          onRename={(name) => patch((d) => renameDraft(d, name))}
          onClose={() => setFinishOpen(false)}
          onStartOver={startOver}
          rideLabel={forRide ? "Use this route" : "Ride it now"}
          showSave={!forRide}
          onRide={(handoff) =>
            forRide ? forRide.onUse(handoff) : navigate("/events/new", { state: handoff })
          }
          onSaved={(path) => {
            clearDraft();
            reset(emptyDraft(draft.profile));
            navigate(path);
          }}
        />
      )}
    </div>
  );
}

function bboxOf(points: readonly LatLng[]): [number, number, number, number] {
  let s = 90;
  let n = -90;
  let w = 180;
  let e = -180;
  for (const [lat, lng] of points) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    w = Math.min(w, lng);
    e = Math.max(e, lng);
  }
  return [s, n, w, e];
}

/** The ride form's copy of the route — thinned (corners kept) only if over its limit. */
export function rideHandoff(draft: RouteDraft, name: string): BuilderRouteHandoff {
  const route = draftToEventRoute(draft);
  if (route.points.length > RIDE_ROUTE_MAX_POINTS) {
    const keep = simplifyIndicesToCount(route.points, RIDE_ROUTE_MAX_POINTS);
    route.points = keep.map((i) => route.points[i]);
    route.elevations = route.elevations ? keep.map((i) => route.elevations?.[i] ?? null) : null;
  }
  return { builderRoute: route, builderName: name, builderProfile: draft.profile };
}

/** POST /routes's body. Full geometry — the library takes up to 50,000 points. */
export function libraryRouteBody(draft: RouteDraft, name: string) {
  const route = draftToEventRoute(draft);
  return {
    name,
    routeType: draft.profile,
    source: "builder",
    isPublic: false,
    points: route.points.map(([lat, lng], i) => {
      const ele = route.elevations?.[i];
      return ele != null ? { lat, lng, ele } : { lat, lng };
    }),
  };
}

interface FinishSheetProps {
  draft: RouteDraft;
  complete: boolean;
  pending: number;
  distanceM: number;
  climbM: number | null;
  canRide: boolean;
  rideLabel: string;
  showSave: boolean;
  onRename(name: string): void;
  onClose(): void;
  onStartOver(): void;
  onRide(handoff: BuilderRouteHandoff): void;
  onSaved(path: string): void;
}

function FinishSheet(props: FinishSheetProps) {
  const { draft, complete } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const name = draft.name.trim() || "My track";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { result } = await apiMutate<{ id: number }>("/routes", {
        method: "POST",
        body: libraryRouteBody(draft, name),
      });
      props.onSaved(trackSharePath(draft.profile, result.id));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Your session expired — sign in again, your track is kept."
          : "Couldn't save. Your track is still here — try again.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.sheetBackdrop} onClick={props.onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Finish your track">
        <div className={styles.sheetHeader}>
          <input
            className={styles.nameInput}
            value={draft.name}
            placeholder="My track"
            maxLength={120}
            aria-label="Track name"
            onChange={(e) => props.onRename(e.target.value)}
          />
          <button
            type="button"
            className={styles.iconButtonFlat}
            aria-label="Close"
            onClick={props.onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <p className={styles.sheetStats}>
          <strong>{formatKm(props.distanceM)} km</strong>
          {props.climbM != null && props.climbM > 0 && (
            <span> · ↗ {Math.round(props.climbM)} m</span>
          )}
          <span> · {draft.profile === "mtb" ? "Off-road" : "Road"}</span>
        </p>
        {!complete && (
          <p className={styles.note}>
            {props.pending > 0
              ? "Finishing the route…"
              : "Part of the route has no road yet — fix it or draw it straight first."}
          </p>
        )}
        {error && (
          <p className={`${styles.note} ${styles.noteError}`} role="alert">
            {error}
          </p>
        )}
        <div className={styles.sheetActions}>
          {props.canRide && (
            <button
              type="button"
              className={styles.primary}
              disabled={!complete || saving}
              onClick={() => props.onRide(rideHandoff(draft, name))}
            >
              <Play aria-hidden="true" /> {props.rideLabel}
            </button>
          )}
          {props.showSave && (
            <button
              type="button"
              className={props.canRide ? undefined : styles.primary}
              disabled={!complete || saving}
              onClick={save}
            >
              {saving ? (
                <Loader2 className={styles.spin} aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}{" "}
              Save to My Tracks
            </button>
          )}
          <button
            type="button"
            disabled={!complete}
            onClick={() =>
              downloadGpxFile(gpxFilenameFor(name), buildGpxFile(draftToEventRoute(draft), name))
            }
          >
            <Download aria-hidden="true" /> Download GPX
          </button>
        </div>
        {props.canRide && (
          <p className={styles.sheetFoot}>{props.rideLabel} doesn't add the track to My Tracks.</p>
        )}
        {confirmStartOver ? (
          <div className={styles.confirmRow}>
            <span>Clear this track?</span>
            <button type="button" className={styles.danger} onClick={props.onStartOver}>
              Clear
            </button>
            <button type="button" onClick={() => setConfirmStartOver(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setConfirmStartOver(true)}
          >
            Start over
          </button>
        )}
      </div>
    </>
  );
}
