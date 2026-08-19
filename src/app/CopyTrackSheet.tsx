/**
 * "Copy track from an existing event" bottom sheet — pick any of the rider's own or other
 * public events, hands the picked EventSummary back via onPick. Originally built inline on
 * EventCreatePage.tsx (for the event's own track); extracted so EventGroupsCard.tsx can reuse
 * the exact same picker for a group's track instead of duplicating ~80 lines of search/list
 * code. Fetching the picked event's actual route (lib/mock-results.ts's getEventResults) is
 * the caller's job, same as it always was — this component only ever hands back which event
 * was picked.
 *
 * The small map icon next to each row's name opens a preview of that event's route — asked
 * for directly ("show map without yet select the event") — without picking it. Tapping the
 * row itself still picks it immediately, same as before; the map icon is a separate, smaller
 * tap target so previewing a few candidates before committing doesn't require picking and
 * reopening the sheet each time.
 *
 * "My rides"/"Others" are toggle buttons, not two stacked sections — asked for directly.
 *
 * "Upload file" parses a CSV of points (lib/track-csv.ts) or a Garmin GPX export
 * (lib/track-gpx.ts) client-side, picked by file extension/content — see those files' doc
 * comments for why the format support stops there (no Excel/FIT). Hands the parsed route back
 * via `onUploadRoute` rather than `onPick`, since there's no source EventSummary for a file —
 * the caller treats the two as alternative ways to end up with a route, not related.
 */

import { Map as MapIcon, Upload, X } from "lucide-react";
import {
  type ChangeEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { type EventRoute, getEventResults } from "../lib/mock-results";
import { LEVEL_LABEL } from "../lib/rider-level";
import { formatLocalMonthYear } from "../lib/time";
import { parseTrackCsv } from "../lib/track-csv";
import { parseTrackGpx } from "../lib/track-gpx";
import { getEventExtras, useEventExtrasStore } from "../store/eventExtrasStore";
import { useEventsStore } from "../store/eventsStore";
import styles from "./CopyTrackSheet.module.css";

const RouteMap = lazy(() => import("./RouteMap"));

// How many rows are revealed per scroll page — both lists are already fetched in full (server,
// falling back to the local cache — see store/eventsStore.ts), so "infinite scroll" here means
// revealing more of what's already in memory as the sentinel row comes into view, not paging
// the network.
const PAGE_SIZE = 20;

export interface UploadedTrack {
  route: EventRoute;
  restStops: [number, number][];
  fileName: string;
}

interface CopyTrackSheetProps {
  title?: string;
  onPick: (event: EventSummary) => void;
  onUploadRoute?: (uploaded: UploadedTrack) => void;
  onClose: () => void;
}

function eventPickerMeta(event: EventSummary): string {
  return [
    event.location,
    event.startsAt ? formatLocalMonthYear(event.startsAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CopyTrackSheet({
  title = "Copy track from an event",
  onPick,
  onUploadRoute,
  onClose,
}: CopyTrackSheetProps) {
  const { status } = useAuth();
  const authed = status === "signed-in";

  const myRides = useEventsStore((s) => s.myRides);
  const otherRides = useEventsStore((s) => s.otherRides);
  const loadMyRides = useEventsStore((s) => s.loadMyRides);
  const loadOtherRides = useEventsStore((s) => s.loadOtherRides);
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"mine" | "others">("mine");
  const [previewEvent, setPreviewEvent] = useState<EventSummary | null>(null);
  const [previewRoute, setPreviewRoute] = useState<EventRoute | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Distance/climb per row — fetched lazily as rows scroll into view (see the infinite-scroll
  // effect below), keyed by event id so a row already fetched never refetches on rerender.
  const [routeMetaByEventId, setRouteMetaByEventId] = useState<
    Record<string, { distanceKm: number; elevationM: number | null }>
  >({});
  const fetchedRouteMetaIds = useRef<Set<string>>(new Set());

  // "Infinite scroll" over the already-fetched list (see PAGE_SIZE's comment) — reveals
  // PAGE_SIZE more rows each time the sentinel row at the bottom scrolls into view.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMyRides(authed);
    loadOtherRides();
  }, [authed, loadMyRides, loadOtherRides]);

  // Switching source or search resets which page we're on — otherwise flipping "My rides" →
  // "Others" could leave the list scrolled to a reveal point that doesn't exist in the new set.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [source, search]);

  async function openPreview(event: EventSummary) {
    setPreviewEvent(event);
    setPreviewRoute(null);
    setPreviewLoading(true);
    try {
      const results = await getEventResults(event.id);
      setPreviewRoute(results.route);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again after an error
    if (!file || !onUploadRoute) return;
    setUploadError(null);
    try {
      const text = await file.text();
      const isGpx = /\.gpx$/i.test(file.name) || /^\s*<\?xml/.test(text);
      const parsed = isGpx ? parseTrackGpx(text) : parseTrackCsv(text);
      if (!parsed) {
        setUploadError(
          isGpx
            ? "Couldn't read any track points from that GPX file."
            : "Couldn't read any points from that file — expected a CSV of lat/lon rows.",
        );
        return;
      }
      onUploadRoute({
        route: {
          points: parsed.points,
          distanceKm: parsed.distanceKm,
          elevationM: null,
          splits: [],
        },
        restStops: parsed.restStopIndices.map((i) => parsed.points[i]),
        fileName: file.name,
      });
    } catch {
      setUploadError("Couldn't read that file.");
    }
  }

  const q = search.trim().toLowerCase();
  const matchingMyRides = useMemo(
    () =>
      myRides.filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q),
      ),
    [myRides, q],
  );
  const matchingOtherRides = useMemo(
    () =>
      otherRides.filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q),
      ),
    [otherRides, q],
  );

  const sourceRides = source === "mine" ? myRides : otherRides;
  const matchingRides =
    source === "mine" ? matchingMyRides : matchingOtherRides;
  const visibleRides = matchingRides.slice(0, visibleCount);
  const hasMoreRides = visibleCount < matchingRides.length;

  // Fetch distance/climb for whatever's currently visible, one page at a time — each id is
  // only ever requested once (fetchedRouteMetaIds), so scrolling back up never re-fetches.
  useEffect(() => {
    const toFetch = visibleRides.filter(
      (e) => !fetchedRouteMetaIds.current.has(e.id),
    );
    if (toFetch.length === 0) return;
    for (const e of toFetch) fetchedRouteMetaIds.current.add(e.id);
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        toFetch.map(async (e) => {
          const results = await getEventResults(e.id);
          return [e.id, results.route] as const;
        }),
      );
      if (cancelled) return;
      setRouteMetaByEventId((prev) => {
        const next = { ...prev };
        for (const [id, route] of entries) {
          next[id] = {
            distanceKm: route.distanceKm,
            elevationM: route.elevationM,
          };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // visibleRides is a fresh array each render (slice()); it's compared by its ids showing up
    // in fetchedRouteMetaIds instead, so this intentionally doesn't depend on its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, q, visibleCount]);

  // Reveal the next page once the sentinel row scrolls into view within the scrollable list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || !hasMoreRides) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreRides]);

  function renderRow(event: EventSummary) {
    const routeMeta = routeMetaByEventId[event.id];
    const level = getEventExtras(extrasByEvent, event.id).level;
    return (
      <div key={event.id} className={styles.row}>
        <button
          type="button"
          className={styles.rowMain}
          onClick={() => onPick(event)}
        >
          <span className={styles.rowName}>{event.name}</span>
          <span className={styles.rowMeta}>{eventPickerMeta(event)}</span>
          <span className={styles.rowStats}>
            {routeMeta
              ? [
                  `${routeMeta.distanceKm} km`,
                  routeMeta.elevationM != null
                    ? `${routeMeta.elevationM} m climb`
                    : null,
                  level ? LEVEL_LABEL[level] : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Loading route…"}
          </span>
        </button>
        <button
          type="button"
          className={styles.mapBtn}
          onClick={() => openPreview(event)}
          aria-label={`Preview ${event.name}'s route on a map`}
          title="Preview on map"
        >
          <MapIcon width={15} height={15} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return createPortal(
    <>
      <div
        className={styles.sheetOverlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.sheet} ${styles.sheetOpen}`}
        role="dialog"
        aria-label={title}
      >
        <div className={styles.sheetHeader}>
          <MapIcon aria-hidden="true" className={styles.sheetHeaderIcon} />
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className={`stack ${styles.sheetBody}`}>
          <div className={styles.sourceToggle}>
            <button
              type="button"
              className={source === "mine" ? "button" : "button button--quiet"}
              onClick={() => setSource("mine")}
            >
              My rides
            </button>
            <button
              type="button"
              className={
                source === "others" ? "button" : "button button--quiet"
              }
              onClick={() => setSource("others")}
            >
              Others
            </button>
          </div>

          {onUploadRoute && (
            <>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload
                  width={14}
                  height={14}
                  aria-hidden="true"
                  style={{ marginRight: 6 }}
                />
                Upload track (CSV or GPX)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.gpx,application/gpx+xml"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              {uploadError && (
                <p
                  className="banner banner--error"
                  role="alert"
                  style={{ fontSize: "0.85rem" }}
                >
                  {uploadError}
                </p>
              )}
            </>
          )}

          <input
            className={styles.search}
            placeholder="Search by name or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className={styles.list} ref={listRef}>
            {sourceRides.length === 0 ? (
              <p className="muted">No map to select.</p>
            ) : matchingRides.length === 0 ? (
              <p className="muted">No rides match.</p>
            ) : (
              <>
                {visibleRides.map(renderRow)}
                {hasMoreRides && (
                  <div
                    ref={sentinelRef}
                    className={styles.scrollSentinel}
                    aria-hidden="true"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {previewEvent && (
        <>
          <div
            className={styles.previewOverlay}
            onClick={() => setPreviewEvent(null)}
            aria-hidden="true"
          />
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.rowName}>{previewEvent.name}</span>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setPreviewEvent(null)}
                aria-label="Close preview"
              >
                <X width={16} height={16} aria-hidden="true" />
              </button>
            </div>
            {previewLoading || !previewRoute ? (
              <div className="row muted" style={{ padding: "var(--space-4)" }}>
                <span className="spinner" aria-hidden="true" />
                Loading route…
              </div>
            ) : (
              <>
                <Suspense
                  fallback={<div className="row muted">Loading the map…</div>}
                >
                  <RouteMap points={previewRoute.points} heightPx={200} />
                </Suspense>
                <div className={styles.previewFooter}>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {previewRoute.distanceKm} km
                    {previewRoute.elevationM != null &&
                      ` · ${previewRoute.elevationM} m climb`}
                  </span>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      onPick(previewEvent);
                      setPreviewEvent(null);
                    }}
                  >
                    Use this track
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
