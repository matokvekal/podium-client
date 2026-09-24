/**
 * The ride page's route map WITH its stop points (sql/049), plus the Stop / Break list under it.
 *
 * Everyone who can see the route sees the ☕ pins and the list, each stop with "Open in Google
 * Maps". The ride's creator (the server's `canManage`, never re-derived here) also gets:
 *   + Add stop  → a small inline bar above the map (no modal): type a place in Hebrew or English,
 *                 Search (OpenStreetMap), pick a result → a red draggable pin lands there. Or
 *                 just tap the map to put the pin there. Save keeps the creator's OWN text as the
 *                 label, never the search result's name.
 *   drag a saved ☕ pin to move it; rename / delete from the list.
 *
 * ISOLATION: the stops come from their own request (app/useRideStops.ts), which fails soft to
 * "none". With no stops and no editor this renders only the plain route map, exactly as before.
 * The list and the add bar sit inside an ErrorBoundary so a bug in them cannot take the map or
 * the ride page down; the map's own stop layer is guarded inside RouteMap.
 */

import { Check, MapPin, Navigation, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, lazy, Suspense, useMemo, useRef, useState } from "react";
import {
  createRideStop,
  deleteRideStop,
  kmAlongRoute,
  type PlaceResult,
  RIDE_STOP_KIND_ICON,
  type RideStop,
  searchPlaces,
  stopErrorMessage,
  stopGoogleMapsUrl,
  updateRideStop,
} from "../lib/ride-stops";
import { ErrorBoundary } from "./ErrorBoundary";
import styles from "./RideStopsSection.module.css";
import type { RideStopsState } from "./useRideStops";

const RouteMap = lazy(() => import("./RouteMap"));

interface RideStopsSectionProps {
  eventId: string;
  points: [number, number][];
  stopsState: RideStopsState;
}

export function RideStopsSection({ eventId, points, stopsState }: RideStopsSectionProps) {
  const { stops, canManage, limits, setStops } = stopsState;
  const [error, setError] = useState<string | null>(null);

  // --- adding ---------------------------------------------------------------------------
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [saving, setSaving] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  const atCap = stops.length >= limits.maxStops;

  function openAdd() {
    setError(null);
    setAdding(true);
    setText("");
    setResults(null);
    setDraft(null);
  }

  function closeAdd() {
    searchAbort.current?.abort();
    setAdding(false);
    setResults(null);
    setDraft(null);
    setSearching(false);
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || searching) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setError(null);
    try {
      const found = await searchPlaces(q, points, controller.signal);
      setResults(found);
      // One clear hit: place the pin right away, one tap saved.
      if (found.length === 1) setDraft([found[0].lat, found[0].lng]);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setError("Search didn't work. Tap the map to place the stop instead.");
      }
    } finally {
      if (searchAbort.current === controller) setSearching(false);
    }
  }

  async function saveDraft() {
    const label = text.trim();
    if (!draft || !label || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createRideStop(eventId, { label, lat: draft[0], lng: draft[1] });
      setStops((current) => [...current, created]);
      closeAdd();
    } catch (err) {
      setError(stopErrorMessage(err, "Couldn't save the stop."));
    } finally {
      setSaving(false);
    }
  }

  // --- editing saved stops ------------------------------------------------------------------
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  async function moveStop(stop: RideStop, lat: number, lng: number) {
    setError(null);
    setStops((current) => current.map((s) => (s.id === stop.id ? { ...s, lat, lng } : s)));
    try {
      const saved = await updateRideStop(eventId, stop.id, { lat, lng });
      setStops((current) => current.map((s) => (s.id === saved.id ? saved : s)));
    } catch (err) {
      // Put the pin back where the server still has it.
      setStops((current) => current.map((s) => (s.id === stop.id ? { ...stop } : s)));
      setError(stopErrorMessage(err, "Couldn't move the stop."));
    }
  }

  async function saveLabel(stop: RideStop) {
    const label = editText.trim();
    if (!label || label === stop.label) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      const saved = await updateRideStop(eventId, stop.id, { label });
      setStops((current) => current.map((s) => (s.id === saved.id ? saved : s)));
      setEditingId(null);
    } catch (err) {
      setError(stopErrorMessage(err, "Couldn't rename the stop."));
    }
  }

  // Delete asks in place (Delete? Yes / No on the row) rather than a browser popup.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function removeStop(stop: RideStop) {
    setConfirmDeleteId(null);
    setError(null);
    try {
      await deleteRideStop(eventId, stop.id);
      setStops((current) => current.filter((s) => s.id !== stop.id));
    } catch (err) {
      setError(stopErrorMessage(err, "Couldn't delete the stop."));
    }
  }

  const kmById = useMemo(() => {
    const out = new Map<number, number | null>();
    for (const s of stops) out.set(s.id, kmAlongRoute(points, s));
    return out;
  }, [points, stops]);

  const showList = stops.length > 0 || canManage;

  return (
    <>
      {adding && (
        <ErrorBoundary title="Adding a stop" onDismiss={closeAdd}>
          <div className={styles.addBar}>
            <form className={styles.searchRow} onSubmit={runSearch}>
              <input
                className={styles.input}
                dir="auto"
                value={text}
                maxLength={limits.maxLabelLength}
                onChange={(e) => setText(e.target.value)}
                placeholder="Stop name or place — e.g. קפה ג'ו, Ein Hod"
                aria-label="Stop name or place"
                // biome-ignore lint/a11y/noAutofocus: the bar opens because the user asked to type
                autoFocus
              />
              <button
                type="submit"
                className={styles.iconBtn}
                disabled={!text.trim() || searching}
                aria-label="Search"
              >
                <Search width={16} height={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={closeAdd}
                aria-label="Cancel adding a stop"
              >
                <X width={16} height={16} aria-hidden="true" />
              </button>
            </form>

            {searching && <p className={styles.hint}>Searching…</p>}
            {results && !searching && results.length === 0 && (
              <p className={styles.hint}>Nothing found. Tap the map to place the stop.</p>
            )}
            {results && results.length > 1 && (
              <ul className={styles.results}>
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      className={styles.resultBtn}
                      data-selected={
                        (draft && draft[0] === r.lat && draft[1] === r.lng) || undefined
                      }
                      onClick={() => setDraft([r.lat, r.lng])}
                      dir="auto"
                    >
                      <MapPin width={14} height={14} aria-hidden="true" />
                      <span>{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.saveRow}>
              <p className={styles.hint}>
                {draft
                  ? "Drag the red pin to the exact spot."
                  : "Search, or tap the map to place the stop."}
              </p>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={saveDraft}
                disabled={!draft || !text.trim() || saving}
              >
                {saving ? "Saving…" : "Save stop"}
              </button>
            </div>
          </div>
        </ErrorBoundary>
      )}

      <Suspense fallback={<div className="row muted">Loading the map…</div>}>
        <RouteMap
          points={points}
          stopPoints={stops}
          editableStops={canManage && !adding}
          onStopMoved={moveStop}
          draftPoint={adding ? draft : null}
          onDraftMoved={(lat, lng) => setDraft([lat, lng])}
          onMapTap={adding ? (lat, lng) => setDraft([lat, lng]) : undefined}
        />
      </Suspense>

      {showList && (
        <ErrorBoundary title="Stops">
          <section className={styles.list} aria-label="Stops">
            <div className={styles.listHeader}>
              <p className={styles.listTitle}>
                Stops
                {canManage && (
                  <span className={styles.counter}>
                    {" "}
                    {stops.length}/{limits.maxStops}
                  </span>
                )}
              </p>
              {canManage && !adding && !atCap && (
                <button type="button" className={styles.addBtn} onClick={openAdd}>
                  <Plus width={14} height={14} aria-hidden="true" />
                  Add stop
                </button>
              )}
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {stops.length === 0 && canManage && !adding && (
              <p className={styles.hint}>
                Add coffee or break stops so riders know where the ride stops.
              </p>
            )}

            {stops.length > 0 && (
              <ul className={styles.rows}>
                {stops.map((stop) => {
                  const km = kmById.get(stop.id) ?? null;
                  const editing = editingId === stop.id;
                  return (
                    <li key={stop.id} className={styles.row}>
                      <span className={styles.icon} aria-hidden="true">
                        {RIDE_STOP_KIND_ICON[stop.kind] ?? "☕"}
                      </span>
                      {editing ? (
                        <form
                          className={styles.editForm}
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveLabel(stop);
                          }}
                        >
                          <input
                            className={styles.input}
                            dir="auto"
                            value={editText}
                            maxLength={limits.maxLabelLength}
                            onChange={(e) => setEditText(e.target.value)}
                            aria-label="Stop name"
                            // biome-ignore lint/a11y/noAutofocus: opened by tapping edit
                            autoFocus
                          />
                          <button type="submit" className={styles.iconBtn} aria-label="Save name">
                            <Check width={16} height={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel rename"
                          >
                            <X width={16} height={16} aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <span className={styles.label}>
                          <span dir="auto">{stop.label}</span>
                          {km != null && <span className={styles.km}>km {km}</span>}
                        </span>
                      )}
                      {!editing && (
                        <span className={styles.actions}>
                          <a
                            className={styles.navBtn}
                            href={stopGoogleMapsUrl(stop)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${stop.label} in Google Maps`}
                            title="Open in Google Maps"
                          >
                            <Navigation width={15} height={15} aria-hidden="true" />
                          </a>
                          {canManage && confirmDeleteId === stop.id && (
                            <>
                              <button
                                type="button"
                                className={styles.confirmBtn}
                                onClick={() => void removeStop(stop)}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => setConfirmDeleteId(null)}
                                aria-label="Keep this stop"
                              >
                                <X width={15} height={15} aria-hidden="true" />
                              </button>
                            </>
                          )}
                          {canManage && confirmDeleteId !== stop.id && (
                            <>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => {
                                  setEditingId(stop.id);
                                  setEditText(stop.label);
                                }}
                                aria-label={`Rename ${stop.label}`}
                              >
                                <Pencil width={15} height={15} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                data-danger
                                onClick={() => setConfirmDeleteId(stop.id)}
                                aria-label={`Delete ${stop.label}`}
                              >
                                <Trash2 width={15} height={15} aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canManage && stops.length > 0 && !adding && (
              <p className={styles.hint}>Drag a ☕ pin on the map to move it.</p>
            )}
          </section>
        </ErrorBoundary>
      )}
    </>
  );
}
