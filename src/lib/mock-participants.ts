// Mock participants (the "start list") — stands in for the Participants endpoints in
// plan/07-api-contract.md ("Part 2 — TO BUILD"): GET/POST/PATCH/DELETE
// /events/:eventId/participants (+ /approve, /reject). Nothing there is built server-side
// yet; the shape below matches that contract and plan/02-database-schema.md's
// event_participants table exactly, so wiring participantsStore.ts to real `apiRequest` calls
// later is a swap of these functions, not a rewrite of the page. See plan/server-tasks.md.
//
// Mutations here (add/edit/delete/approve/reject/attendance) are kept in
// store/participantsStore.ts, persisted to localStorage keyed by event id — this file only
// ever generates the *initial* deterministic seed list for an event id that hasn't been seen
// before, the same "hash the id, pick something plausible" trick lib/mock-results.ts uses so
// every event has a start list rather than an empty one until the server exists.

export type RegistrationStatus = "registered" | "waiting_approval" | "approved" | "rejected";
export type AttendanceStatus = "unknown" | "present" | "dns" | "started";
export type ResultStatus = "none" | "finished" | "dnf" | "stopped" | "unknown";

export interface Participant {
  id: string;
  eventId: string;
  userId: number | null;
  name: string;
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

const FIRST_NAMES = [
  "Noa",
  "Yossi",
  "Dana",
  "Amir",
  "Lior",
  "Karin",
  "Tomer",
  "Eli",
  "Maya",
  "Guy",
  "Shira",
  "Roni",
];
const LAST_NAMES = [
  "Peretz",
  "Katz",
  "Cohen",
  "Shalev",
  "Ben-David",
  "Weiss",
  "Adiv",
  "Mizrahi",
  "Rosen",
  "Adler",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

const REGISTRATION_CYCLE: RegistrationStatus[] = [
  "approved",
  "approved",
  "registered",
  "waiting_approval",
  "approved",
];

/**
 * Same size formula as seedParticipants, without building the list — for card-browsing
 * contexts (Find Rides, My Rides) that only need "how many riders" and shouldn't pay for
 * generating 6-15 full Participant objects, or trigger loading the real list, just to show a
 * count. Always agrees with seedParticipants(eventId).length for the same id.
 */
export function seedParticipantCount(eventId: string): number {
  return 6 + (hashString(eventId) % 10);
}

/**
 * Deterministic seed start list for an event id — same rider names/order every time for a
 * given id, so reloading doesn't reshuffle who's on the list before any real edits happen.
 * `size` between 6 and 15, picked from the id itself.
 */
export function seedParticipants(eventId: string, isRace: boolean): Participant[] {
  const base = hashString(eventId);
  const size = 6 + (base % 10);
  const list: Participant[] = [];
  for (let i = 0; i < size; i++) {
    const first = FIRST_NAMES[(base + i * 7) % FIRST_NAMES.length];
    const last = LAST_NAMES[(base + i * 13) % LAST_NAMES.length];
    list.push({
      id: `${eventId}-seed-${i}`,
      eventId,
      userId: i % 4 === 0 ? null : 1000 + i, // some rows are manual entries, no account
      name: `${first} ${last}`,
      bib: isRace ? String(10 + i) : null,
      email: i % 3 === 0 ? `${first.toLowerCase()}.${last.toLowerCase()}@example.com` : null,
      phone: i % 4 === 1 ? `+972-5${(base + i) % 10}-555-01${10 + i}` : null,
      category: isRace ? (i % 2 === 0 ? "Men Open" : "Women Open") : null,
      registrationStatus: REGISTRATION_CYCLE[(base + i) % REGISTRATION_CYCLE.length],
      attendanceStatus: "unknown",
      resultStatus: "none",
      joinedAt: new Date(Date.now() - (size - i) * 3600_000).toISOString(),
      groupId: null,
    });
  }
  return list;
}
