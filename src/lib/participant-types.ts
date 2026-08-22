// Participant ("start list") types — the shape matches the server's participants module
// (elnino-server/src/modules/participants) and plan/02-database-schema.md's event_participants
// table. This file is types only — no data. The deterministic mock seed list that used to
// live in lib/mock-participants.ts is gone (see BUGS.md "Remove fake/mock riders"): a rider
// list must contain only real server/DB participants, never a fabricated fallback.

export type RegistrationStatus = "registered" | "waiting_approval" | "approved" | "rejected";
export type AttendanceStatus = "unknown" | "present" | "dns" | "started";
export type ResultStatus = "none" | "finished" | "dnf" | "stopped" | "unknown";

export interface Participant {
  id: string;
  eventId: string;
  userId: number | null;
  name: string;
  /** Real account's Google profile photo, or null for a manual/account-less participant. */
  avatarUrl: string | null;
  bib: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  registrationStatus: RegistrationStatus;
  attendanceStatus: AttendanceStatus;
  resultStatus: ResultStatus;
  joinedAt: string;
  /** Which of the event's groups (store/eventGroupsStore.ts) this rider rides in — null until
   * assigned, and always null for an event with no groups defined. Client-only, same as
   * groups themselves; no server concept of this exists. */
  groupId: string | null;
}
