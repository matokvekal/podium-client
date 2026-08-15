/**
 * Teams (clubs) — "pro teams have rides a few times a week ... all members can see schedule."
 * A team gathers several events into one shared, ongoing schedule, with its own membership
 * (invite/approve) — see store/teamsStore.ts's doc comment for why this is new territory, not
 * in any plan/ doc before this session.
 *
 * Route:    /teams
 * Loads:    nothing from a server — teamsStore.ts is entirely client-only/localStorage, no
 *           server concept of a "team" exists at all yet (see plan/server-tasks.md).
 * Actions:  create a team (name only); open one to see its schedule/members.
 * State:    the new-team name input
 *
 * "My teams" here means "teams I created" — membership rows have no real account link (same
 * mock-first pattern as store/participantsStore.ts's organizer-added rows: `userId: null`),
 * so there's no reliable way yet to show "teams I was invited into" for someone who isn't the
 * creator. Real support needs teams tied to real accounts — see plan/server-tasks.md.
 */

import { Plus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTeamsStore } from "../store/teamsStore";
import styles from "./TeamsPage.module.css";

export function TeamsPage() {
  const { status, profile } = useAuth();
  const authed = status === "signed-in";

  const teams = useTeamsStore((s) => s.teams);
  const eventIds = useTeamsStore((s) => s.eventIds);
  const members = useTeamsStore((s) => s.members);
  const createTeam = useTeamsStore((s) => s.createTeam);

  const [newTeamName, setNewTeamName] = useState("");

  const myTeams = Object.values(teams)
    .filter((t) => profile != null && t.createdBy === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !newTeamName.trim()) return;
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
        A team's rides show up together as one schedule for its members.
      </p>

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

      {myTeams.length === 0 ? (
        <p className="muted">No teams yet — create one above.</p>
      ) : (
        <div className={styles.list}>
          {myTeams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`} className={styles.row}>
              <span className={styles.rowName}>{team.name}</span>
              <span className={styles.rowMeta}>
                <Users width={12} height={12} aria-hidden="true" style={{ marginRight: 4 }} />
                {(members[team.id] ?? []).length} members · {(eventIds[team.id] ?? []).length} rides
                scheduled
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
