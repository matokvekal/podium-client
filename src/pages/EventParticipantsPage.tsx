/**
 * Participants — the start list, manual add, edit/delete, registration approval, and
 * event-day check-in, all in one page. Owner-only (same "not permitted" pattern
 * EventDetailPage's own actions rely on, just enforced as a full-page gate here since this
 * page has nothing else on it for a non-owner to see).
 *
 * Route:    /events/:eventId/participants
 * Loads:    GET /events/:eventId for the event's name/type/isOwner (same endpoint
 *           EventDetailPage uses); the participant list itself is mock-seeded — see
 *           lib/mock-participants.ts and store/participantsStore.ts — standing in for
 *           plan/07-api-contract.md's Participants endpoints, none of which are built
 *           server-side yet (see plan/server-tasks.md Part D).
 * Actions:  add a participant by hand (name/phone/email, +bib/category for a race), edit or
 *           delete one, approve/reject a self-registered rider, mark present for event-day
 *           check-in (persisted — see participantsStore.ts).
 *
 * "Import from file" (Excel/CSV, mentioned in the API contract for races) is shown but
 * disabled for RACE events only — explicitly asked for, explicitly deferred: real parsing and
 * validation is a separate, unscoped piece of work, not a mock this page can fake responsibly
 * (a fake-parsed CSV would misrepresent what rows actually made it onto the start list).
 */

import {
  Check,
  CheckCircle2,
  Pencil,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ParticipantFormSheet, type ParticipantFormValues } from "../app/ParticipantFormSheet";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { getCachedEvent } from "../lib/local-db";
import type { Participant } from "../lib/mock-participants";
import { useEventGroupsStore } from "../store/eventGroupsStore";
import { useParticipantsStore } from "../store/participantsStore";
import styles from "./EventParticipantsPage.module.css";

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

function toFormValues(p: Participant): ParticipantFormValues {
  return {
    name: p.name,
    phone: p.phone ?? "",
    email: p.email ?? "",
    bib: p.bib ?? "",
    category: p.category ?? "",
    groupId: p.groupId ?? "",
  };
}

export function EventParticipantsPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);

  const byEvent = useParticipantsStore((s) => s.byEvent);
  const ensureLoaded = useParticipantsStore((s) => s.ensureLoaded);
  const addParticipant = useParticipantsStore((s) => s.addParticipant);
  const updateParticipant = useParticipantsStore((s) => s.updateParticipant);
  const deleteParticipant = useParticipantsStore((s) => s.deleteParticipant);
  const setRegistrationStatus = useParticipantsStore((s) => s.setRegistrationStatus);
  const setAttendance = useParticipantsStore((s) => s.setAttendance);

  const groupsByEvent = useEventGroupsStore((s) => s.byEvent);
  const groups = (eventId && groupsByEvent[eventId]) || [];
  const groupName = (groupId: string | null) => groups.find((g) => g.id === groupId)?.name ?? null;

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);

    // Same cached-summary fallback as EventDetailPage.tsx's detailFromCachedSummary — without
    // it this page has no way to show anything for a mock "my ride" (no real server ever
    // resolves GET /events/:id for those), and isOwner has to be derived the same way, from
    // profile.id against the cached summary's ownerId, not trusted only from the server.
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
        if (cached) return; // already showing the cached fallback above
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
    return () => {
      cancelled = true;
    };
  }, [eventId, profile]);

  const isRace = event?.type === "RACE";

  useEffect(() => {
    if (eventId && event) ensureLoaded(eventId, isRace);
  }, [eventId, event, isRace, ensureLoaded]);

  const participants = (eventId && byEvent[eventId]) || [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? participants
      : participants.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.bib ?? "").toLowerCase().includes(q),
        );
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [participants, search]);

  const presentCount = participants.filter((p) => p.attendanceStatus === "present").length;

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
        Only the event organizer can manage participants.
      </p>
    );
  }

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Participants</h1>
          <p className="muted" style={{ margin: 0 }}>
            {event.name}
          </p>
        </div>
        <div className="row">
          <Link className="button button--quiet" to={`/events/${event.id}/groups`}>
            <Users width={14} height={14} aria-hidden="true" style={{ marginRight: 6 }} />
            Groups
          </Link>
          <Link className="button button--quiet" to={`/events/${event.id}`}>
            Back to event
          </Link>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="badge">{participants.length} total</span>
        <span className="badge badge--live">{presentCount} arrived</span>
      </div>

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="button" onClick={() => setAddOpen(true)}>
          <UserPlus width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
          Add participant
        </button>
        {isRace && (
          <button
            type="button"
            className="button button--quiet"
            disabled
            title="Excel/CSV import — coming soon"
          >
            <Upload width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
            Import from file (soon)
          </button>
        )}
      </div>

      <input
        className={styles.search}
        placeholder="Search by name or bib…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className={styles.list}>
        {visible.length === 0 ? (
          <p className="muted">No participants match.</p>
        ) : (
          visible.map((p) => (
            <div key={p.id} className={styles.row}>
              <button
                type="button"
                className={
                  p.attendanceStatus === "present"
                    ? `${styles.checkBtn} ${styles.checkBtnActive}`
                    : styles.checkBtn
                }
                onClick={() =>
                  eventId && setAttendance(eventId, p.id, p.attendanceStatus !== "present")
                }
                aria-pressed={p.attendanceStatus === "present"}
                aria-label={p.attendanceStatus === "present" ? "Mark not arrived" : "Mark arrived"}
                title="Check in"
              >
                <Check width={16} height={16} aria-hidden="true" />
              </button>

              <div className={styles.info}>
                <div className={styles.name}>
                  {p.name}
                  {p.bib && <span className={styles.bib}>#{p.bib}</span>}
                </div>
                <div className={styles.meta}>
                  {[groupName(p.groupId), p.category, p.phone, p.email]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>

              {p.registrationStatus === "waiting_approval" ? (
                <div className={styles.approveRow}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => eventId && setRegistrationStatus(eventId, p.id, "approved")}
                    aria-label="Approve"
                    title="Approve"
                  >
                    <CheckCircle2 width={17} height={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => eventId && setRegistrationStatus(eventId, p.id, "rejected")}
                    aria-label="Reject"
                    title="Reject"
                  >
                    <XCircle width={17} height={17} aria-hidden="true" />
                  </button>
                </div>
              ) : p.registrationStatus === "approved" ? (
                <button
                  type="button"
                  className={styles.statusBadge}
                  data-status={p.registrationStatus}
                  onClick={() =>
                    eventId && setRegistrationStatus(eventId, p.id, "waiting_approval")
                  }
                  title="Unapprove — send back to pending"
                >
                  approved
                </button>
              ) : (
                <span className={styles.statusBadge} data-status={p.registrationStatus}>
                  {p.registrationStatus.replace("_", " ")}
                </span>
              )}

              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setEditing(p)}
                aria-label="Edit"
                title="Edit"
              >
                <Pencil width={15} height={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => {
                  if (eventId && window.confirm(`Remove ${p.name} from this event?`)) {
                    deleteParticipant(eventId, p.id);
                  }
                }}
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 width={15} height={15} aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      {addOpen && (
        <ParticipantFormSheet
          title="Add participant"
          initial={EMPTY_FORM}
          isRace={isRace}
          groupOptions={groups}
          onClose={() => setAddOpen(false)}
          onSubmit={(values) => {
            if (eventId) addParticipant(eventId, values);
            setAddOpen(false);
          }}
        />
      )}

      {editing && (
        <ParticipantFormSheet
          title="Edit participant"
          initial={toFormValues(editing)}
          isRace={isRace}
          groupOptions={groups}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            if (eventId) updateParticipant(eventId, editing.id, values);
            setEditing(null);
          }}
          extraActions={
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                if (eventId && window.confirm(`Remove ${editing.name} from this event?`)) {
                  deleteParticipant(eventId, editing.id);
                  setEditing(null);
                }
              }}
            >
              <X width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
              Remove from event
            </button>
          }
        />
      )}
    </section>
  );
}
