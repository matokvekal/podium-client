/**
 * "Invited" tab body on the home screen (EventsListPage.tsx) — events someone was sent a join
 * link/code for (recorded by JoinPage.tsx's lookUp(), see store/invitedEventsStore.ts),
 * distinct from "Find Rides" (general public discovery) and "My Rides" (already joined/owned).
 *
 * Always visible as its own tab, same as Find Rides/Find Tracks, regardless of sign-in state —
 * a guest who opened a share link before registering still sees it after navigating to "/" and
 * back, before ever signing in. Was a persistent banner shown above the tab bar on every tab;
 * moved into its own tab so it doesn't take up space when there's nothing pending and doesn't
 * compete for attention with whichever tab the rider actually wants.
 */

import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useInvitedEventsStore } from "../store/invitedEventsStore";
import { EmptyRidesState } from "./EmptyRidesState";

export function InvitedEventsTab() {
  const byEventId = useInvitedEventsStore((state) => state.byEventId);
  const removeInvite = useInvitedEventsStore((state) => state.removeInvite);

  const invites = Object.values(byEventId).sort((a, b) => b.invitedAt - a.invitedAt);

  return (
    <section className="stack">
      <div className="section-header">
        <div className="section-title-row">
          <h2>Invited</h2>
          {invites.length > 0 && <span className="section-count">{invites.length}</span>}
        </div>
      </div>

      {invites.length === 0 ? (
        <EmptyRidesState title="No invites yet" subtitle="Links you open will show up here." />
      ) : (
        <div className="stack">
          {invites.map((invite) => (
            <div
              key={invite.eventId}
              className="card row"
              style={{ justifyContent: "space-between" }}
            >
              <span className="stack" style={{ gap: 2 }}>
                <strong>{invite.name}</strong>
                <span className="muted">{invite.type === "RACE" ? "Race" : "Ride"}</span>
              </span>
              <span className="row" style={{ gap: 8 }}>
                <Link className="button" to={`/join/${invite.code}`}>
                  View invite
                </Link>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => removeInvite(invite.eventId)}
                  aria-label={`Dismiss invite to ${invite.name}`}
                >
                  <X aria-hidden="true" width={16} height={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
