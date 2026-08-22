/**
 * Teams (clubs) — "pro teams have rides a few times a week ... all members can see schedule."
 * A team gathers several events under one name via each event's own team picker, with its own
 * membership (invite/approve) — see store/teamsStore.ts's doc comment for why this is new
 * territory, not in any plan/ doc before this session.
 *
 * Route:    /teams
 * Loads:    nothing from a server — teamsStore.ts is entirely client-only/localStorage, no
 *           server concept of a "team" exists at all yet (see plan/server-tasks.md).
 * Actions:  create a team (name only, capped at FREE_TEAM_LIMIT on the standard plan — "more
 *           will be for pay later," asked for directly; there's no billing system to actually
 *           enforce or upgrade that yet, this is just the cap); open one to manage its members
 *           (TeamDetailPage.tsx — membership only, not a schedule view).
 * State:    the new-team name input
 *
 * "My teams" here means "teams I created" — membership rows have no real account link (same
 * mock-first pattern as store/participantsStore.ts's organizer-added rows: `userId: null`),
 * so there's no reliable way yet to show "teams I was invited into" for someone who isn't the
 * creator. Real support needs teams tied to real accounts — see plan/server-tasks.md.
 */

import { Lock, Plus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTeamsStore } from "../store/teamsStore";
import styles from "./TeamsPage.module.css";

// Standard (free) plan cap — asked for directly: "stynadart user can create up 2 teams more
// will be for pay later." No billing/plan system exists anywhere in this app yet, so this is
// just the cap itself; there is nowhere to actually upgrade from yet, honestly labeled as such
// below rather than linking to a paid plan that doesn't exist.
const FREE_TEAM_LIMIT = 2;

export function TeamsPage() {
  const { status, profile } = useAuth();
  const authed = status === "signed-in";

  const teams = useTeamsStore((s) => s.teams);
  const members = useTeamsStore((s) => s.members);
  const createTeam = useTeamsStore((s) => s.createTeam);

  const [newTeamName, setNewTeamName] = useState("");

  const myTeams = Object.values(teams)
    .filter((t) => profile != null && t.createdBy === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const atLimit = myTeams.length >= FREE_TEAM_LIMIT;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !newTeamName.trim() || atLimit) return;
    createTeam(newTeamName, profile.id);
    setNewTeamName("");
  }

  if (!authed) {
    return (
      <section className="stack">
        <h1>Teams</h1>
        <p className="muted">Sign in to create or manage a team.</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>Teams</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Create a team, then add riders — a ride's team picker links it to whichever team you pick.
      </p>

      {atLimit ? (
        <p className={`card ${styles.limitNote}`}>
          <Lock width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
          Free plan: up to {FREE_TEAM_LIMIT} teams. More teams will be available on a paid plan
          (coming later).
        </p>
      ) : (
        <form className="card row" onSubmit={submit}>
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="New team name — e.g. Galilee Cycling Club"
            style={{ flex: 1 }}
          />
          <button className="button" type="submit" disabled={!newTeamName.trim()}>
            <Plus width={15} height={15} aria-hidden="true" style={{ marginRight: 4 }} />
            Create
          </button>
        </form>
      )}

      {myTeams.length === 0 ? (
        <p className="muted">No teams yet — create one above.</p>
      ) : (
        <div className={styles.list}>
          {myTeams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`} className={styles.row}>
              <span className={styles.rowName}>{team.name}</span>
              <span className={styles.rowMeta}>
                <Users width={12} height={12} aria-hidden="true" style={{ marginRight: 4 }} />
                {(members[team.id] ?? []).length} members
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
