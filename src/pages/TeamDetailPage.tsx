/**
 * One team's membership. See TeamsPage.tsx / store/teamsStore.ts for the broader context —
 * pro-team use case, several rides a week under one team name.
 *
 * Route:    /teams/:teamId
 * Loads:    the team from teamsStore.ts (client-only, localStorage — no server concept of a
 *           "team" exists yet).
 * Actions:  add/approve/remove a member. Four ways to add, same "make it easy, simple like
 *           other apps" ask as the rest of this page: by hand (name/phone/email, same
 *           manual-entry pattern as participantsStore.ts — an organizer add is pre-approved),
 *           from a file (one "Name,Phone,Email" row per line — CSV export from Sheets/Excel
 *           reads fine as-is), from the device's phone contacts (Contact Picker API — Chrome/
 *           Android only, feature-detected; no fallback UI when unsupported, same "honest,
 *           nothing fake" rule as everywhere else, see event-visuals.ts), or a WhatsApp invite
 *           (opens wa.me with a pre-filled message — there's no real join-by-link flow for
 *           teams yet, unlike events' /join/:code, so this composes a message for the
 *           organizer to send, it doesn't add anyone automatically).
 * State:    the add-member form fields
 *
 * A team's rides are not managed here — creating one already happens through the normal
 * "+ Add ride" flow (EventCreatePage.tsx's team picker links it in via addEventToTeam), and
 * they show up wherever a rider's rides normally do (home screen, "My Rides"), not in a
 * second schedule list duplicated on this page — asked for directly: "dont show the rides or
 * add ride that you can do at history."
 *
 * Owner-only for membership management (creator only, `team.createdBy === profile.id`) — same
 * "not permitted" gate as EventParticipantsPage.tsx.
 */

import { Contact, MessageCircle, Trash2, Upload, UserPlus } from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { type TeamMemberStatus, useTeamsStore } from "../store/teamsStore";
import styles from "./TeamDetailPage.module.css";

// Chrome/Android only — not in the DOM lib types yet, so it's typed narrowly right where it's
// used instead of widening the global Navigator type for one feature-detected call.
interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<Array<{ name?: string[]; tel?: string[] }>>;
}

export function TeamDetailPage() {
  const { teamId } = useParams();
  const { profile } = useAuth();

  const teams = useTeamsStore((s) => s.teams);
  const members = useTeamsStore((s) => s.members);
  const addMember = useTeamsStore((s) => s.addMember);
  const addMembers = useTeamsStore((s) => s.addMembers);
  const removeMember = useTeamsStore((s) => s.removeMember);
  const setMemberStatus = useTeamsStore((s) => s.setMemberStatus);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contactsSupported =
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window;

  const team = teamId ? teams[teamId] : undefined;
  const teamMembers = (teamId && members[teamId]) || [];

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

  function handleFileImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !teamId) return;
    file.text().then((text) => {
      const inputs = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [rowName, rowPhone, rowEmail] = line
            .split(",")
            .map((cell) => cell.trim());
          return { name: rowName ?? "", phone: rowPhone, email: rowEmail };
        });
      addMembers(teamId, inputs);
    });
  }

  async function pickFromContacts() {
    if (!teamId) return;
    const contacts = (navigator as Navigator & { contacts?: ContactsManager })
      .contacts;
    if (!contacts) return;
    try {
      const picked = await contacts.select(["name", "tel"], { multiple: true });
      const inputs = picked.map((c) => ({
        name: c.name?.[0] ?? "",
        phone: c.tel?.[0],
      }));
      addMembers(teamId, inputs);
    } catch {
      // User cancelled the picker — not an error.
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `You're invited to ride with ${team.name}! Download El Niño Move to join.`,
  )}`;

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{team.name}</h1>
        <Link className="button button--quiet" to="/teams">
          All teams
        </Link>
      </div>

      {isOwner && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Members</h2>
          </div>

          {/* Four ways to add riders, same "easy, simple like other apps" ask — asked for
              directly. */}
          <div className={styles.addToolbar}>
            <button
              type="button"
              className={styles.addToolbarBtn}
              onClick={() => setAddOpen((v) => !v)}
            >
              <UserPlus width={18} height={18} aria-hidden="true" />
              By hand
            </button>
            <button
              type="button"
              className={styles.addToolbarBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload width={18} height={18} aria-hidden="true" />
              From file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileImport}
              style={{ display: "none" }}
            />
            {contactsSupported && (
              <button
                type="button"
                className={styles.addToolbarBtn}
                onClick={pickFromContacts}
              >
                <Contact width={18} height={18} aria-hidden="true" />
                Contacts
              </button>
            )}
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.addToolbarBtn}
            >
              <MessageCircle width={18} height={18} aria-hidden="true" />
              WhatsApp
            </a>
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
              <input
                id="member-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
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
                      {[member.phone, member.email]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  {member.status === "waiting_approval" ? (
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() =>
                        setMemberStatus(
                          team.id,
                          member.id,
                          "approved" as TeamMemberStatus,
                        )
                      }
                    >
                      Approve
                    </button>
                  ) : (
                    <span
                      className={styles.statusBadge}
                      data-status={member.status}
                    >
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
