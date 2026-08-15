// Participants ("start list") state for one event at a time — see lib/mock-participants.ts
// for why this is mock-seeded rather than fetched. Persisted to localStorage (keyed by event
// id) so adds/edits/deletes/approvals and check-in marks survive a reload — asked for
// explicitly for the check-in count ("remember"), applied here to every mutation, not just
// attendance, since there is no real server to hold any of it otherwise.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Participant,
  type RegistrationStatus,
  seedParticipants,
} from "../lib/mock-participants";

interface NewParticipantInput {
  name: string;
  phone?: string;
  email?: string;
  bib?: string;
  category?: string;
  groupId?: string | null;
}

interface ParticipantsState {
  byEvent: Record<string, Participant[]>;
  ensureLoaded(eventId: string, isRace: boolean): void;
  addParticipant(eventId: string, input: NewParticipantInput): void;
  updateParticipant(eventId: string, id: string, input: NewParticipantInput): void;
  deleteParticipant(eventId: string, id: string): void;
  setRegistrationStatus(eventId: string, id: string, status: RegistrationStatus): void;
  setAttendance(eventId: string, id: string, present: boolean): void;
  setGroupId(eventId: string, id: string, groupId: string | null): void;
  /** Assign several riders to a group in one action — the common case in practice, per direct
   * feedback ("select all group a and group b and add many"): picking one rider at a time to
   * fill a 20-person group is too slow. */
  setGroupIdBulk(eventId: string, ids: string[], groupId: string | null): void;
  /** attendanceStatus "started" — a rider has set off. Separate axis from "present"
   * (checked in but hasn't left yet) — see plan/02-database-schema.md's three-axis note. */
  setStarted(eventId: string, id: string, started: boolean): void;
  /** resultStatus "finished" — arrived at the finish. Not a place or a time, just "did they
   * make it back" — the safety check this was asked for ("for kid"). */
  setFinished(eventId: string, id: string, finished: boolean): void;
}

function mapEvent(
  byEvent: Record<string, Participant[]>,
  eventId: string,
  fn: (list: Participant[]) => Participant[],
): Record<string, Participant[]> {
  const list = byEvent[eventId];
  if (!list) return byEvent;
  return { ...byEvent, [eventId]: fn(list) };
}

let localId = 0;

export const useParticipantsStore = create<ParticipantsState>()(
  persist(
    (set) => ({
      byEvent: {},

      ensureLoaded(eventId, isRace) {
        set((state) =>
          state.byEvent[eventId]
            ? state
            : { byEvent: { ...state.byEvent, [eventId]: seedParticipants(eventId, isRace) } },
        );
      },

      addParticipant(eventId, input) {
        set((state) => {
          const participant: Participant = {
            id: `local-${++localId}`,
            eventId,
            userId: null,
            name: input.name.trim(),
            bib: input.bib?.trim() || null,
            email: input.email?.trim() || null,
            phone: input.phone?.trim() || null,
            category: input.category?.trim() || null,
            registrationStatus: "approved", // organizer-added — no approval step needed
            attendanceStatus: "unknown",
            resultStatus: "none",
            joinedAt: new Date().toISOString(),
            groupId: input.groupId || null,
          };
          const list = state.byEvent[eventId] ?? [];
          return { byEvent: { ...state.byEvent, [eventId]: [participant, ...list] } };
        });
      },

      updateParticipant(eventId, id, input) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) =>
              p.id === id
                ? {
                    ...p,
                    name: input.name.trim(),
                    bib: input.bib?.trim() || null,
                    email: input.email?.trim() || null,
                    phone: input.phone?.trim() || null,
                    category: input.category?.trim() || null,
                    groupId: input.groupId || null,
                  }
                : p,
            ),
          ),
        }));
      },

      deleteParticipant(eventId, id) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) => list.filter((p) => p.id !== id)),
        }));
      },

      setRegistrationStatus(eventId, id, status) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) => (p.id === id ? { ...p, registrationStatus: status } : p)),
          ),
        }));
      },

      setAttendance(eventId, id, present) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) =>
              p.id === id ? { ...p, attendanceStatus: present ? "present" : "unknown" } : p,
            ),
          ),
        }));
      },

      setGroupId(eventId, id, groupId) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) => (p.id === id ? { ...p, groupId } : p)),
          ),
        }));
      },

      setGroupIdBulk(eventId, ids, groupId) {
        const idSet = new Set(ids);
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) => (idSet.has(p.id) ? { ...p, groupId } : p)),
          ),
        }));
      },

      setStarted(eventId, id, started) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) =>
              p.id === id ? { ...p, attendanceStatus: started ? "started" : "unknown" } : p,
            ),
          ),
        }));
      },

      setFinished(eventId, id, finished) {
        set((state) => ({
          byEvent: mapEvent(state.byEvent, eventId, (list) =>
            list.map((p) =>
              p.id === id ? { ...p, resultStatus: finished ? "finished" : "none" } : p,
            ),
          ),
        }));
      },
    }),
    { name: "podium.participants" },
  ),
);
