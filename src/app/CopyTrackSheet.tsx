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
 * "Upload file" parses a CSV of points client-side (lib/track-csv.ts) — deliberately CSV
 * only, not Excel/GPX/FIT, see that file's doc comment for why. Hands the parsed route back
 * via `onUploadRoute` rather than `onPick`, since there's no source EventSummary for a file —
 * the caller treats the two as alternative ways to end up with a route, not related.
 */

import { Map as MapIcon, Upload, X } from "lucide-react";
import { type ChangeEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { EventSummary } from "../lib/local-db";
import { type EventRoute, getEventResults } from "../lib/mock-results";
import { formatLocalMonthYear } from "../lib/time";
import { parseTrackCsv } from "../lib/track-csv";
import { useEventsStore } from "../store/eventsStore";
import styles from "./CopyTrackSheet.module.css";

const RouteMap = lazy(() => import("./RouteMap"));

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
  return [event.location, event.startsAt ? formatLocalMonthYear(event.startsAt) : null]
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

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"mine" | "others">("mine");
  const [previewEvent, setPreviewEvent] = useState<EventSummary | null>(null);
  const [previewRoute, setPreviewRoute] = useState<EventRoute | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMyRides(authed);
    loadOtherRides();
  }, [authed, loadMyRides, loadOtherRides]);

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
      const parsed = parseTrackCsv(text);
      if (!parsed) {
        setUploadError("Couldn't read any points from that file — expected a CSV of lat/lon rows.");
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
          !q || e.name.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q),
      ),
    [myRides, q],
  );
  const matchingOtherRides = useMemo(
    () =>
      otherRides.filter(
        (e) =>
          !q || e.name.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q),
      ),
    [otherRides, q],
  );

  function renderRow(event: EventSummary) {
    return (
      <div key={event.id} className={styles.row}>
        <button type="button" className={styles.rowMain} onClick={() => onPick(event)}>
          <span className={styles.rowName}>{event.name}</span>
          <span className={styles.rowMeta}>{eventPickerMeta(event)}</span>
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

  return (
    <>
      <div className={styles.sheetOverlay} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${styles.sheetOpen}`}>
        <div className={styles.sheetHeader}>
          <h2 style={{ margin: 0 }}>{title}</h2>
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
              className={source === "others" ? "button" : "button button--quiet"}
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
                <Upload width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
                Upload CSV (points file)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              {uploadError && (
                <p className="banner banner--error" role="alert" style={{ fontSize: "0.85rem" }}>
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

          <div className={styles.list}>
            {source === "mine" ? (
              matchingMyRides.length === 0 ? (
                <p className="muted">No rides match.</p>
              ) : (
                matchingMyRides.map(renderRow)
              )
            ) : matchingOtherRides.length === 0 ? (
              <p className="muted">No rides match.</p>
            ) : (
              matchingOtherRides.map(renderRow)
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
                <Suspense fallback={<div className="row muted">Loading the map…</div>}>
                  <RouteMap points={previewRoute.points} heightPx={200} />
                </Suspense>
                <div className={styles.previewFooter}>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {previewRoute.distanceKm} km
                    {previewRoute.elevationM != null && ` · ${previewRoute.elevationM} m climb`}
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
    </>
  );
}
