// Participants ("start list") for one event at a time — wired to the real server module
// (elnino-server/src/modules/participants). Add/edit/delete and registration approve/reject
// are real, server-backed mutations now.
//
// The attendance axis is real and server-owned now: PATCH /events/:eventId/participants/:id/
// attendance (status: unknown | present | dns | started) exists, so "arrived" and "started"
// are persisted server-side instead of in the local overlay. That matters beyond durability —
// EventDetailPage reads the start list straight from GET /events/:eventId/participants, so an
// arrival kept only in this browser's localStorage could never show up there, and a second
// organizer (or the same one on another device) would never see it at all.
//
// resultStatus and groupId are still a local overlay, persisted to localStorage and merged on
// top of the server list on every read: resultStatus has a write endpoint but "mark finishers"
// is its own unbuilt flow (plan/01-task-list.md milestone 4), and groupId has no server
// concept the client uses at all (store/eventGroupsStore.ts is entirely client-only). An
// attendanceStatus left in a persisted overlay from before this change is simply ignored —
// LocalOverlay no longer carries that key, so the server value always wins.
//
// Participant ids are numbers server-side; kept as strings on the client Participant type
// (unchanged from before) so every existing call site (`p.id`, keyed maps, form values)
// continues to work without a wider rewrite — converted at the two edges (String() on read,
// Number() before an API call).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ApiError, apiRequest } from "../lib/api-client";
import type {
  AttendanceStatus,
  Participant,
  RegistrationStatus,
  ResultStatus,
} from "../lib/participant-types";

interface NewParticipantInput {
  name: string;
  phone?: string;
  email?: string;
  bib?: string;
  category?: string;
  groupId?: string | null;
}

interface ServerParticipant {
  id: number;
  eventId: string;
  userId: number | null;
  name: string;
  avatarUrl: string | null;
  bib: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  registrationStatus: RegistrationStatus;
  attendanceStatus: AttendanceStatus;
  resultStatus: ResultStatus;
  joinedAt: string;
}

interface LocalOverlay {
  resultStatus?: ResultStatus;
  groupId?: string | null;
}

interface ParticipantsState {
  byEvent: Record<string, Participant[]>;
  serverByEvent: Record<string, ServerParticipant[]>;
  overlay: Record<string, LocalOverlay>;
  loadingEvents: Record<string, boolean>;
  ensureLoaded(eventId: string): Promise<void>;
  addParticipant(eventId: string, input: NewParticipantInput): Promise<void>;
  updateParticipant(eventId: string, id: string, input: NewParticipantInput): Promise<void>;
  deleteParticipant(eventId: string, id: string): Promise<void>;
  setRegistrationStatus(
    eventId: string,
    id: string,
    status: "approved" | "rejected",
  ): Promise<void>;
  /** attendanceStatus "present" — the rider turned up. Real, server-backed mutation. */
  setAttendance(eventId: string, id: string, present: boolean): Promise<void>;
  setGroupId(eventId: string, id: string, groupId: string | null): void;
  /** Assign several riders to a group in one action — the common case in practice, per direct
   * feedback ("select all group a and group b and add many"): picking one rider at a time to
   * fill a 20-person group is too slow. */
  setGroupIdBulk(eventId: string, ids: string[], groupId: string | null): void;
  /** attendanceStatus "started" — a rider has set off. Same real endpoint as setAttendance. */
  setStarted(eventId: string, id: string, started: boolean): Promise<void>;
  /** resultStatus "finished" — arrived at the finish. Local overlay only, see file doc comment. */
  setFinished(eventId: string, id: string, finished: boolean): void;
}

function toParticipant(server: ServerParticipant, overlay: LocalOverlay | undefined): Participant {
  return {
    id: String(server.id),
    eventId: server.eventId,
    userId: server.userId,
    name: server.name,
    avatarUrl: server.avatarUrl,
    bib: server.bib,
    email: server.email,
    phone: server.phone,
    category: server.category,
    registrationStatus: server.registrationStatus,
    attendanceStatus: server.attendanceStatus,
    resultStatus: overlay?.resultStatus ?? server.resultStatus,
    joinedAt: server.joinedAt,
    groupId: overlay?.groupId ?? null,
  };
}

function toRequestBody(input: NewParticipantInput) {
  // Optional server fields are `.optional()`, not `.nullable()` — an empty string must be
  // omitted entirely (JSON.stringify drops `undefined` keys), not sent as "" or null, or a
  // field like email would fail its format check on an intentionally-blank value.
  return {
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    category: input.category?.trim() || undefined,
    bib: input.bib?.trim() || undefined,
  };
}

function recompute(
  serverByEvent: Record<string, ServerParticipant[]>,
  overlay: Record<string, LocalOverlay>,
  eventId: string,
): Record<string, Participant[]> {
  const list = serverByEvent[eventId];
  if (!list) return {};
  return { [eventId]: list.map((p) => toParticipant(p, overlay[String(p.id)])) };
}

/** Merges one server row back into an event's list, replacing the row with the same id. */
function applyServerParticipant(
  state: ParticipantsState,
  eventId: string,
  updated: ServerParticipant,
) {
  const list = (state.serverByEvent[eventId] ?? []).map((p) =>
    p.id === updated.id ? updated : p,
  );
  return {
    serverByEvent: { ...state.serverByEvent, [eventId]: list },
    byEvent: {
      ...state.byEvent,
      ...recompute({ [eventId]: list }, state.overlay, eventId),
    },
  };
}

/**
 * The one attendance write. Both "arrived" (present) and "set off" (started) are the same
 * server axis and the same endpoint — three axes, three endpoints, per the server's own
 * participant.routes.ts. Deliberately NOT optimistic: an organizer ticking riders off at the
 * start needs the tick to mean "the server has it", not "this tab thinks so", and the two
 * screens that call this both surface a failure rather than swallowing it.
 */
async function writeAttendance(
  set: (fn: (state: ParticipantsState) => Partial<ParticipantsState>) => void,
  eventId: string,
  id: string,
  status: AttendanceStatus,
): Promise<void> {
  const updated = await apiRequest<ServerParticipant>(
    `/events/${eventId}/participants/${id}/attendance`,
    { method: "PATCH", body: { status } },
  );
  set((state) => applyServerParticipant(state, eventId, updated));
}

export const useParticipantsStore = create<ParticipantsState>()(
  persist(
    (set, get) => ({
      byEvent: {},
      serverByEvent: {},
      overlay: {},
      loadingEvents: {},

      async ensureLoaded(eventId) {
        if (get().loadingEvents[eventId]) return;
        set((state) => ({ loadingEvents: { ...state.loadingEvents, [eventId]: true } }));
        try {
          const list = await apiRequest<ServerParticipant[]>(`/events/${eventId}/participants`);
          set((state) => ({
            serverByEvent: { ...state.serverByEvent, [eventId]: list },
            byEvent: {
              ...state.byEvent,
              ...recompute({ [eventId]: list }, state.overlay, eventId),
            },
          }));
        } finally {
          set((state) => ({ loadingEvents: { ...state.loadingEvents, [eventId]: false } }));
        }
      },

      async addParticipant(eventId, input) {
        const created = await apiRequest<ServerParticipant>(`/events/${eventId}/participants`, {
          method: "POST",
          body: toRequestBody(input),
        });
        set((state) => {
          const list = [created, ...(state.serverByEvent[eventId] ?? [])];
          const overlay = input.groupId
            ? { ...state.overlay, [String(created.id)]: { groupId: input.groupId || null } }
            : state.overlay;
          return {
            serverByEvent: { ...state.serverByEvent, [eventId]: list },
            overlay,
            byEvent: { ...state.byEvent, ...recompute({ [eventId]: list }, overlay, eventId) },
          };
        });
      },

      async updateParticipant(eventId, id, input) {
        const updated = await apiRequest<ServerParticipant>(
          `/events/${eventId}/participants/${id}`,
          { method: "PATCH", body: toRequestBody(input) },
        );
        set((state) => {
          const list = (state.serverByEvent[eventId] ?? []).map((p) =>
            p.id === updated.id ? updated : p,
          );
          const overlay = {
            ...state.overlay,
            [id]: { ...state.overlay[id], groupId: input.groupId || null },
          };
          return {
            serverByEvent: { ...state.serverByEvent, [eventId]: list },
            overlay,
            byEvent: { ...state.byEvent, ...recompute({ [eventId]: list }, overlay, eventId) },
          };
        });
      },

      async deleteParticipant(eventId, id) {
        try {
          await apiRequest(`/events/${eventId}/participants/${id}`, { method: "DELETE" });
        } catch (err) {
          // A 404 here means it's already gone (offline retry, or removed elsewhere) — still
          // drop it from local state rather than leaving a ghost row the user just tried to
          // remove. Any other failure re-throws so the page can show a real error.
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
        set((state) => {
          const list = (state.serverByEvent[eventId] ?? []).filter((p) => String(p.id) !== id);
          return {
            serverByEvent: { ...state.serverByEvent, [eventId]: list },
            byEvent: {
              ...state.byEvent,
              ...recompute({ [eventId]: list }, state.overlay, eventId),
            },
          };
        });
      },

      async setRegistrationStatus(eventId, id, status) {
        const updated = await apiRequest<ServerParticipant>(
          `/events/${eventId}/participants/${id}/${status === "approved" ? "approve" : "reject"}`,
          { method: "POST" },
        );
        set((state) => {
          const list = (state.serverByEvent[eventId] ?? []).map((p) =>
            p.id === updated.id ? updated : p,
          );
          return {
            serverByEvent: { ...state.serverByEvent, [eventId]: list },
            byEvent: {
              ...state.byEvent,
              ...recompute({ [eventId]: list }, state.overlay, eventId),
            },
          };
        });
      },

      setAttendance(eventId, id, present) {
        return writeAttendance(set, eventId, id, present ? "present" : "unknown");
      },

      setGroupId(eventId, id, groupId) {
        set((state) => {
          const overlay = { ...state.overlay, [id]: { ...state.overlay[id], groupId } };
          return {
            overlay,
            byEvent: { ...state.byEvent, ...recompute(state.serverByEvent, overlay, eventId) },
          };
        });
      },

      setGroupIdBulk(eventId, ids, groupId) {
        set((state) => {
          const overlay = { ...state.overlay };
          for (const id of ids) overlay[id] = { ...overlay[id], groupId };
          return {
            overlay,
            byEvent: { ...state.byEvent, ...recompute(state.serverByEvent, overlay, eventId) },
          };
        });
      },

      setStarted(eventId, id, started) {
        return writeAttendance(set, eventId, id, started ? "started" : "unknown");
      },

      setFinished(eventId, id, finished) {
        set((state) => {
          const overlay = {
            ...state.overlay,
            [id]: {
              ...state.overlay[id],
              resultStatus: finished ? "finished" : ("none" as ResultStatus),
            },
          };
          return {
            overlay,
            byEvent: { ...state.byEvent, ...recompute(state.serverByEvent, overlay, eventId) },
          };
        });
      },
    }),
    {
      name: "podium.participants",
      // Only the local overlay (group assignments, attendance/result overrides) is worth
      // persisting across a reload — the server list itself is refetched by ensureLoaded every
      // time a participants-bearing page mounts, and persisting a stale copy of it risked
      // showing yesterday's approve/reject state until the next fetch overwrote it.
      partialize: (state) => ({ overlay: state.overlay }),
    },
  ),
);
