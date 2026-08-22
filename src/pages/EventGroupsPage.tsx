/**
 * Ride groups — a club/team riding one event as 2-4 separate groups at once (e.g. "Elite" /
 * "Masters"), each with its own start time and optionally its own track. Not about placing or
 * competing between groups — see store/eventGroupsStore.ts's doc comment. Owner-only, same
 * "not permitted" gate as EventParticipantsPage.tsx.
 *
 * Route:    /events/:eventId/groups
 * Loads:    GET /events/:eventId (same cached-summary fallback as EventParticipantsPage.tsx);
 *           groups from store/eventGroupsStore.ts (client-only, no server concept of this
 *           exists at all — see plan/server-tasks.md Part D); the main event route (for the
 *           map view's fallback when a group has no track of its own) from
 *           GET /events/:eventId/route, same as EventDetailPage.
 * Actions:  swipe/page between groups (prev/next), add/rename/remove a group, set a group's
 *           start time, copy or remove a group's track, switch List/Map view, add riders to
 *           the current group (pick from existing participants — multi-select, or add a brand
 *           new one), remove a rider from the group, mark a rider Started/Finished.
 *
 * List mode deliberately shows just name (+phone) per rider — no bib, category, distance
 * (every rider in a group covers the same km, the group's own distance already says that) —
 * and no split/place data, consistent with RiderResultRow.tsx's doc comment on this being
 * rides, not races. Started/Finished reuse the existing three-axis participant status
 * (attendanceStatus "started", resultStatus "finished" — see participantsStore.ts) rather than
 * inventing new fields: a plain "did they leave / did they make it back" safety check, not a
 * timing system — asked for directly ("for kid").
 */

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
  Map as MapIcon,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CopyTrackSheet } from "../app/CopyTrackSheet";
import { ParticipantFormSheet, type ParticipantFormValues } from "../app/ParticipantFormSheet";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import type { EventRoute } from "../lib/event-route";
import { getCachedEvent } from "../lib/local-db";
import { toDatetimeLocalValue } from "../lib/quick-add-parser";
import { MAX_GROUPS, useEventGroupsStore } from "../store/eventGroupsStore";
import { useParticipantsStore } from "../store/participantsStore";
import styles from "./EventGroupsPage.module.css";

const RouteMap = lazy(() => import("../app/RouteMap"));

interface EventInfo {
  id: string;
  name: string;
  type: "RIDE" | "RACE";
  isOwner: boolean;
}

const EMPTY_FORM: ParticipantFormValues = {
  name: "",
  phone: "",
  email: "",
  bib: "",
  category: "",
  groupId: "",
};

export function EventGroupsPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainRoute, setMainRoute] = useState<EventRoute | null>(null);

  const [groupIndex, setGroupIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [copyTrackOpen, setCopyTrackOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [newParticipantOpen, setNewParticipantOpen] = useState(false);

  const groupsByEvent = useEventGroupsStore((s) => s.byEvent);
  const addGroup = useEventGroupsStore((s) => s.addGroup);
  const renameGroup = useEventGroupsStore((s) => s.renameGroup);
  const setGroupStartsAt = useEventGroupsStore((s) => s.setGroupStartsAt);
  const removeGroup = useEventGroupsStore((s) => s.removeGroup);
  const setGroupTrack = useEventGroupsStore((s) => s.setGroupTrack);
  const clearGroupTrack = useEventGroupsStore((s) => s.clearGroupTrack);

  const participantsByEvent = useParticipantsStore((s) => s.byEvent);
  const ensureParticipantsLoaded = useParticipantsStore((s) => s.ensureLoaded);
  const addParticipant = useParticipantsStore((s) => s.addParticipant);
  const setGroupId = useParticipantsStore((s) => s.setGroupId);
  const setGroupIdBulk = useParticipantsStore((s) => s.setGroupIdBulk);
  const setStarted = useParticipantsStore((s) => s.setStarted);
  const setFinished = useParticipantsStore((s) => s.setFinished);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);

    getCachedEvent(eventId).then((cached) => {
      if (cancelled || !cached) return;
      setEvent({
        id: cached.id,
        name: cached.name,
        type: cached.type,
        isOwner: profile != null && profile.id === cached.ownerId,
      });
      setError(null);
      setLoading(false);
    });

    apiRequest<EventInfo>(`/events/${eventId}`)
      .then((found) => {
        if (cancelled) return;
        setEvent(found);
        setError(null);
      })
      .catch(async (err) => {
        if (cancelled) return;
        const cached = await getCachedEvent(eventId);
        if (cached) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "This event is private."
            : err instanceof ApiError && err.status === 404
              ? "Event not found."
              : "Could not load this event.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // The event's real saved route (server) — never a fabricated stand-in; null when the
    // event has no route yet.
    apiRequest<EventRoute | null>(`/events/${eventId}/route`)
      .then((route) => {
        if (!cancelled) setMainRoute(route);
      })
      .catch(() => {
        // No route saved for this event, or this viewer can't see it — mainRoute stays null.
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, profile]);

  const isRace = event?.type === "RACE";

  useEffect(() => {
    if (eventId && event) void ensureParticipantsLoaded(eventId);
  }, [eventId, event, ensureParticipantsLoaded]);

  const groups = (eventId && groupsByEvent[eventId]) || [];
  const clampedIndex = Math.min(groupIndex, Math.max(groups.length - 1, 0));
  const currentGroup = groups[clampedIndex] ?? null;

  const participants = (eventId && participantsByEvent[eventId]) || [];
  const ridersInGroup = useMemo(
    () => (currentGroup ? participants.filter((p) => p.groupId === currentGroup.id) : []),
    [participants, currentGroup],
  );
  const availableToAdd = useMemo(
    () => (currentGroup ? participants.filter((p) => p.groupId !== currentGroup.id) : []),
    [participants, currentGroup],
  );

  function toggleSelectToAdd(id: string) {
    setSelectedToAdd((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelectedToGroup() {
    if (!eventId || !currentGroup || selectedToAdd.size === 0) return;
    setGroupIdBulk(eventId, [...selectedToAdd], currentGroup.id);
    setSelectedToAdd(new Set());
    setAddPickerOpen(false);
  }

  async function pickTrack(sourceEvent: { id: string; name: string }) {
    if (!eventId || !currentGroup) return;
    setCopyTrackOpen(false);
    setCopyLoading(true);
    try {
      const route = await apiRequest<EventRoute | null>(`/events/${sourceEvent.id}/route`);
      if (!route) {
        setError("That event has no saved route to copy.");
        return;
      }
      setGroupTrack(eventId, currentGroup.id, route, sourceEvent.name);
    } finally {
      setCopyLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading…</span>
      </div>
    );
  }

  if (error || !event) {
    return (
      <p className="banner banner--error" role="alert">
        {error ?? "Event not found."}
      </p>
    );
  }

  if (!event.isOwner) {
    return (
      <p className="banner banner--error" role="alert">
        Only the event organizer can manage groups.
      </p>
    );
  }

  const mapPoints = currentGroup?.route?.points ?? mainRoute?.points ?? null;

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Groups</h1>
          <p className="muted" style={{ margin: 0 }}>
            {event.name}
          </p>
        </div>
        <Link className="button button--quiet" to={`/events/${event.id}/participants`}>
          Participants
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            No groups yet — the whole event rides one route. Add up to {MAX_GROUPS} (e.g. "Elite" /
            "Masters") if this club/team splits into more than one at the same event.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => eventId && addGroup(eventId, "Group 1")}
          >
            <Plus width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
            Add group
          </button>
        </div>
      ) : (
        <div className="card stack">
          <div className={styles.pager}>
            <button
              type="button"
              className="button button--quiet"
              disabled={clampedIndex === 0}
              onClick={() => setGroupIndex(Math.max(0, clampedIndex - 1))}
              aria-label="Previous group"
            >
              <ChevronLeft width={18} height={18} aria-hidden="true" />
            </button>

            <input
              className={styles.nameInput}
              value={currentGroup?.name ?? ""}
              onChange={(e) =>
                eventId && currentGroup && renameGroup(eventId, currentGroup.id, e.target.value)
              }
              aria-label="Group name"
            />

            <button
              type="button"
              className="button button--quiet"
              disabled={clampedIndex >= groups.length - 1}
              onClick={() => setGroupIndex(Math.min(groups.length - 1, clampedIndex + 1))}
              aria-label="Next group"
            >
              <ChevronRight width={18} height={18} aria-hidden="true" />
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}>
            {clampedIndex + 1} of {groups.length}
          </p>

          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="button button--quiet"
              disabled={groups.length >= MAX_GROUPS}
              onClick={() => {
                if (!eventId) return;
                addGroup(eventId, `Group ${groups.length + 1}`);
                setGroupIndex(groups.length);
              }}
            >
              <Plus width={14} height={14} aria-hidden="true" style={{ marginRight: 4 }} />
              Add group
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                if (!eventId || !currentGroup) return;
                if (window.confirm(`Remove ${currentGroup.name}? Its riders stay on the event.`)) {
                  removeGroup(eventId, currentGroup.id);
                  setGroupIndex(0);
                }
              }}
            >
              <Trash2 width={14} height={14} aria-hidden="true" style={{ marginRight: 4 }} />
              Remove group
            </button>
          </div>

          <label htmlFor="group-starts-at" className="muted" style={{ fontSize: "0.85rem" }}>
            Start time
          </label>
          <input
            id="group-starts-at"
            type="datetime-local"
            value={
              currentGroup?.startsAt ? toDatetimeLocalValue(new Date(currentGroup.startsAt)) : ""
            }
            onChange={(e) => {
              if (!eventId || !currentGroup) return;
              const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
              setGroupStartsAt(eventId, currentGroup.id, iso);
            }}
          />

          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {copyLoading
                ? "Loading route…"
                : currentGroup?.route
                  ? `${currentGroup.route.distanceKm} km${currentGroup.route.elevationM != null ? ` · ${currentGroup.route.elevationM} m climb` : ""} — copied from ${currentGroup.copiedFromName}`
                  : "Uses the main event route"}
            </span>
            <div className="row">
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setCopyTrackOpen(true)}
              >
                {currentGroup?.route ? "Change track" : "Copy track"}
              </button>
              {currentGroup?.route && (
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() =>
                    eventId && currentGroup && clearGroupTrack(eventId, currentGroup.id)
                  }
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className={styles.viewToggle}>
            <button
              type="button"
              className={viewMode === "list" ? "button" : "button button--quiet"}
              onClick={() => setViewMode("list")}
            >
              <ListIcon width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
              List
            </button>
            <button
              type="button"
              className={viewMode === "map" ? "button" : "button button--quiet"}
              onClick={() => setViewMode("map")}
            >
              <MapIcon width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
              Map
            </button>
          </div>

          {viewMode === "map" ? (
            mapPoints ? (
              <Suspense fallback={<div className="row muted">Loading the map…</div>}>
                <RouteMap points={mapPoints} />
              </Suspense>
            ) : (
              <p className="muted">No track set for this group yet.</p>
            )
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="badge">{ridersInGroup.length} riders</span>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setAddPickerOpen(true)}
                >
                  <UserPlus width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
                  Add riders
                </button>
              </div>

              <div className={styles.list}>
                {ridersInGroup.length === 0 ? (
                  <p className="muted">No riders in this group yet.</p>
                ) : (
                  ridersInGroup.map((p) => (
                    <div key={p.id} className={styles.row}>
                      <div className={styles.info}>
                        <div className={styles.name}>{p.name}</div>
                        {p.phone && <div className={styles.phone}>{p.phone}</div>}
                      </div>
                      <button
                        type="button"
                        className={
                          p.attendanceStatus === "started"
                            ? `${styles.checkBtn} ${styles.checkBtnActive}`
                            : styles.checkBtn
                        }
                        onClick={() =>
                          eventId && setStarted(eventId, p.id, p.attendanceStatus !== "started")
                        }
                        aria-pressed={p.attendanceStatus === "started"}
                      >
                        <Check width={13} height={13} aria-hidden="true" />
                        Started
                      </button>
                      <button
                        type="button"
                        className={
                          p.resultStatus === "finished"
                            ? `${styles.checkBtn} ${styles.finishBtnActive}`
                            : styles.checkBtn
                        }
                        onClick={() =>
                          eventId && setFinished(eventId, p.id, p.resultStatus !== "finished")
                        }
                        aria-pressed={p.resultStatus === "finished"}
                      >
                        <CheckCircle2 width={13} height={13} aria-hidden="true" />
                        Finished
                      </button>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => eventId && setGroupId(eventId, p.id, null)}
                        aria-label={`Remove ${p.name} from group`}
                        title="Remove from group"
                      >
                        <X width={15} height={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {copyTrackOpen && (
        <CopyTrackSheet
          title={`Copy track for ${currentGroup?.name ?? "group"}`}
          onPick={pickTrack}
          onClose={() => setCopyTrackOpen(false)}
        />
      )}

      {addPickerOpen && currentGroup && (
        <>
          <div
            className={styles.sheetOverlay}
            onClick={() => setAddPickerOpen(false)}
            aria-hidden="true"
          />
          <div className={styles.sheet}>
            <div className={styles.sheetHeader}>
              <h2 style={{ margin: 0 }}>Add riders to {currentGroup.name}</h2>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setAddPickerOpen(false)}
                aria-label="Close"
              >
                <X width={18} height={18} aria-hidden="true" />
              </button>
            </div>
            <div className={`stack ${styles.sheetBody}`}>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  setAddPickerOpen(false);
                  setNewParticipantOpen(true);
                }}
              >
                <UserPlus width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
                New participant
              </button>

              {availableToAdd.length === 0 ? (
                <p className="muted">Every other participant is already in this group.</p>
              ) : (
                <div className={styles.pickList}>
                  {availableToAdd.map((p) => (
                    <label
                      key={p.id}
                      className={
                        selectedToAdd.has(p.id)
                          ? `${styles.pickRow} ${styles.pickRowChecked}`
                          : styles.pickRow
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selectedToAdd.has(p.id)}
                        onChange={() => toggleSelectToAdd(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="button"
                disabled={selectedToAdd.size === 0}
                onClick={addSelectedToGroup}
              >
                Add {selectedToAdd.size || ""} to {currentGroup.name}
              </button>
            </div>
          </div>
        </>
      )}

      {newParticipantOpen && currentGroup && (
        <ParticipantFormSheet
          title={`New participant — ${currentGroup.name}`}
          initial={{ ...EMPTY_FORM, groupId: currentGroup.id }}
          isRace={isRace}
          groupOptions={groups}
          onClose={() => setNewParticipantOpen(false)}
          onSubmit={(values) => {
            if (eventId) addParticipant(eventId, values);
            setNewParticipantOpen(false);
          }}
        />
      )}
    </section>
  );
}
