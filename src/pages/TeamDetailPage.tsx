/**
 * One team's shared schedule + membership. See TeamsPage.tsx / store/teamsStore.ts for the
 * broader context — pro-team use case, several rides a week, all members see the schedule.
 *
 * Route:    /teams/:teamId
 * Loads:    the team + its scheduled event ids from teamsStore.ts (client-only), then resolves
 *           each event id to a summary via lib/local-db.ts's cache — the same cached-summary
 *           fallback EventDetailPage.tsx/EventGroupsPage.tsx use, since there's no server
 *           endpoint for "events belonging to team X" (teams aren't a server concept at all).
 * Actions:  add/approve/remove a member (name/phone/email, same manual-entry pattern as
 *           participantsStore.ts — an organizer add is pre-approved); remove a ride from the
 *           schedule (does not delete the event itself); "+ Add ride" links to
 *           /events/new?team=:teamId, which pre-selects this team.
 * State:    the add-member form fields
 *
 * Owner-only for membership management (creator only, `team.createdBy === profile.id`) — same
 * "not permitted" gate as EventParticipantsPage.tsx.
 */

import { Plus, Trash2, UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { type EventSummary, getCachedEvent } from "../lib/local-db";
import { formatLocalDateTime } from "../lib/time";
import { type TeamMemberStatus, useTeamsStore } from "../store/teamsStore";
import styles from "./TeamDetailPage.module.css";

export function TeamDetailPage() {
  const { teamId } = useParams();
  const { profile } = useAuth();

  const teams = useTeamsStore((s) => s.teams);
  const members = useTeamsStore((s) => s.members);
  const eventIds = useTeamsStore((s) => s.eventIds);
  const addMember = useTeamsStore((s) => s.addMember);
  const removeMember = useTeamsStore((s) => s.removeMember);
  const setMemberStatus = useTeamsStore((s) => s.setMemberStatus);
  const removeEventFromTeam = useTeamsStore((s) => s.removeEventFromTeam);

  const [events, setEvents] = useState<Record<string, EventSummary>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const team = teamId ? teams[teamId] : undefined;
  const scheduledIds = (teamId && eventIds[teamId]) || [];
  const teamMembers = (teamId && members[teamId]) || [];
  // A fresh array from the store selector every render — join to a stable string so the
  // effect below only re-runs when the actual set of ids changes, not on every render.
  const scheduledIdsKey = scheduledIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = scheduledIdsKey ? scheduledIdsKey.split(",") : [];
    Promise.all(ids.map((id) => getCachedEvent(id))).then((found) => {
      if (cancelled) return;
      const byId: Record<string, EventSummary> = {};
      for (const event of found) if (event) byId[event.id] = event;
      setEvents(byId);
    });
    return () => {
      cancelled = true;
    };
  }, [scheduledIdsKey]);

  const schedule = scheduledIds
    .map((id) => events[id])
    .filter((e): e is EventSummary => !!e)
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  if (!team) {
    return (
      <p className="banner banner--error" role="alert">
        Team not found.
      </p>
    );
  }

  const isOwner = profile != null && profile.id === team.createdBy;

  function submitMember(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !name.trim()) return;
    addMember(teamId, { name, phone, email });
    setName("");
    setPhone("");
    setEmail("");
    setAddOpen(false);
  }

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{team.name}</h1>
        <Link className="button button--quiet" to="/teams">
          All teams
        </Link>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Schedule</h2>
          {isOwner && (
            <Link className="button button--quiet" to={`/events/new?team=${team.id}`}>
              <Plus width={14} height={14} aria-hidden="true" style={{ marginRight: 4 }} />
              Add ride
            </Link>
          )}
        </div>
        {schedule.length === 0 ? (
          <p className="muted">No rides scheduled yet.</p>
        ) : (
          <div className={styles.list}>
            {schedule.map((event) => (
              <div key={event.id} className={styles.row}>
                <Link
                  to={`/events/${event.id}`}
                  className={styles.info}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className={styles.name}>{event.name}</div>
                  <div className={styles.meta}>
                    {event.startsAt ? formatLocalDateTime(event.startsAt) : "No date set"}
                    {event.location && ` · ${event.location}`}
                  </div>
                </Link>
                {isOwner && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeEventFromTeam(team.id, event.id)}
                    aria-label="Remove from schedule"
                    title="Remove from schedule (does not delete the ride)"
                  >
                    <X width={15} height={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Members</h2>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setAddOpen((v) => !v)}
            >
              <UserPlus width={14} height={14} aria-hidden="true" style={{ marginRight: 4 }} />
              Invite
            </button>
          </div>

          {addOpen && (
            <form className="stack" onSubmit={submitMember}>
              <label htmlFor="member-name">Name</label>
              <input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <label htmlFor="member-phone">Phone</label>
              <input id="member-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <label htmlFor="member-email">Email</label>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="button" type="submit" disabled={!name.trim()}>
                Add member
              </button>
            </form>
          )}

          {teamMembers.length === 0 ? (
            <p className="muted">No members yet.</p>
          ) : (
            <div className={styles.list}>
              {teamMembers.map((member) => (
                <div key={member.id} className={styles.row}>
                  <div className={styles.info}>
                    <div className={styles.name}>{member.name}</div>
                    <div className={styles.meta}>
                      {[member.phone, member.email].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {member.status === "waiting_approval" ? (
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() =>
                        setMemberStatus(team.id, member.id, "approved" as TeamMemberStatus)
                      }
                    >
                      Approve
                    </button>
                  ) : (
                    <span className={styles.statusBadge} data-status={member.status}>
                      {member.status}
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeMember(team.id, member.id)}
                    aria-label={`Remove ${member.name}`}
                  >
                    <Trash2 width={15} height={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
