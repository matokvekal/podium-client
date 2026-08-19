// Teams (clubs) — "pro teams have rides a few times a week, some standard, some new tracks,
// all members can see schedule, sometimes I invite new [riders] and I approve them." A team is
// a real linkable entity (not just a free-text name) so its rides can be gathered under one
// name (EventCreatePage.tsx's team picker, via addEventToTeam) instead of each just carrying a
// free-text organizer string. TeamDetailPage.tsx itself is membership-only, not a schedule
// view — a team's rides show up wherever a rider's rides normally do, not a second list here
// (asked for directly). Entirely new territory, not in any plan/ doc at all before this — see
// plan/server-tasks.md for what real support needs. Persisted to localStorage, same pattern as
// store/eventGroupsStore.ts / participantsStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Team {
  id: string;
  name: string;
  createdBy: number;
  createdAt: string;
}

export type TeamMemberStatus = "invited" | "waiting_approval" | "approved";

export interface TeamMember {
  id: string;
  userId: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  status: TeamMemberStatus;
}

interface NewMemberInput {
  name: string;
  phone?: string;
  email?: string;
}

interface TeamsState {
  teams: Record<string, Team>;
  members: Record<string, TeamMember[]>; // by teamId
  eventIds: Record<string, string[]>; // teamId -> scheduled event ids, newest-added last

  createTeam(name: string, createdBy: number): Team;
  removeTeam(teamId: string): void;

  // Organizer-added members are pre-approved, same convention as participantsStore.addParticipant
  // — a direct add IS the approval ("or i approved by invitation").
  addMember(teamId: string, input: NewMemberInput): void;
  // Bulk variant for the file-import and phone-contacts add methods on TeamDetailPage.tsx —
  // one store write for N rows instead of N, and rows with no name are silently dropped rather
  // than each needing its own validation error.
  addMembers(teamId: string, inputs: NewMemberInput[]): void;
  removeMember(teamId: string, memberId: string): void;
  setMemberStatus(
    teamId: string,
    memberId: string,
    status: TeamMemberStatus,
  ): void;

  addEventToTeam(teamId: string, eventId: string): void;
}

let localId = 0;

export const useTeamsStore = create<TeamsState>()(
  persist(
    (set) => ({
      teams: {},
      members: {},
      eventIds: {},

      createTeam(name, createdBy) {
        const team: Team = {
          id: `team-${++localId}`,
          name: name.trim() || "Untitled team",
          createdBy,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ teams: { ...state.teams, [team.id]: team } }));
        return team;
      },

      removeTeam(teamId) {
        set((state) => {
          const { [teamId]: _team, ...teams } = state.teams;
          const { [teamId]: _members, ...members } = state.members;
          const { [teamId]: _eventIds, ...eventIds } = state.eventIds;
          return { teams, members, eventIds };
        });
      },

      addMember(teamId, input) {
        const member: TeamMember = {
          id: `member-${++localId}`,
          userId: null,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          status: "approved",
        };
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: [...(state.members[teamId] ?? []), member],
          },
        }));
      },

      addMembers(teamId, inputs) {
        set((state) => {
          const newMembers: TeamMember[] = inputs
            .filter((input) => input.name.trim())
            .map((input) => ({
              id: `member-${++localId}`,
              userId: null,
              name: input.name.trim(),
              phone: input.phone?.trim() || null,
              email: input.email?.trim() || null,
              status: "approved",
            }));
          if (newMembers.length === 0) return state;
          return {
            members: {
              ...state.members,
              [teamId]: [...(state.members[teamId] ?? []), ...newMembers],
            },
          };
        });
      },

      removeMember(teamId, memberId) {
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: (state.members[teamId] ?? []).filter(
              (m) => m.id !== memberId,
            ),
          },
        }));
      },

      setMemberStatus(teamId, memberId, status) {
        set((state) => ({
          members: {
            ...state.members,
            [teamId]: (state.members[teamId] ?? []).map((m) =>
              m.id === memberId ? { ...m, status } : m,
            ),
          },
        }));
      },

      addEventToTeam(teamId, eventId) {
        set((state) => {
          const existing = state.eventIds[teamId] ?? [];
          if (existing.includes(eventId)) return state;
          return {
            eventIds: { ...state.eventIds, [teamId]: [...existing, eventId] },
          };
        });
      },
    }),
    { name: "podium.teams" },
  ),
);
