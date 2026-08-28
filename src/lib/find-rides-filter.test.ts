import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyFindRidesCriteria,
  DEFAULT_FIND_RIDES_CRITERIA,
  difficultyBucket,
  type FindRidesCriteria,
  matchesWhen,
} from "./find-rides-filter";
import type { EventSummary } from "./local-db";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function ride(over: Partial<EventSummary>): EventSummary {
  return {
    id: Math.random().toString(36),
    code: "13082026A",
    name: "Ride",
    type: "RIDE",
    status: "published",
    visibility: "public",
    displayMode: "standard",
    startsAt: inDays(3),
    endsAt: null,
    location: null,
    ownerId: 1,
    ownerName: null,
    ownerAvatarUrl: null,
    ...over,
  };
}

const crit = (over: Partial<FindRidesCriteria> = {}): FindRidesCriteria => ({
  ...DEFAULT_FIND_RIDES_CRITERIA,
  ...over,
});

describe("difficultyBucket", () => {
  it("collapses five levels into three buckets", () => {
    expect(difficultyBucket("beginner")).toBe("easy");
    expect(difficultyBucket("intermediate")).toBe("medium");
    expect(difficultyBucket("masters")).toBe("medium");
    expect(difficultyBucket("elite")).toBe("hard");
    expect(difficultyBucket("world_tour")).toBe("hard");
    expect(difficultyBucket(null)).toBeNull();
  });
});

describe("matchesWhen", () => {
  it("any always matches, even with no date", () => {
    expect(matchesWhen(null, "any", NOW)).toBe(true);
  });
  it("dated filters never match an event with no start time", () => {
    expect(matchesWhen(null, "week", NOW)).toBe(false);
  });
  it("today matches only today", () => {
    expect(matchesWhen(inDays(0), "today", NOW)).toBe(true);
    expect(matchesWhen(inDays(1), "today", NOW)).toBe(false);
  });
  it("week matches within 7 days, month within 31", () => {
    expect(matchesWhen(inDays(6), "week", NOW)).toBe(true);
    expect(matchesWhen(inDays(10), "week", NOW)).toBe(false);
    expect(matchesWhen(inDays(10), "month", NOW)).toBe(true);
    expect(matchesWhen(inDays(40), "month", NOW)).toBe(false);
  });
  it("excludes past events", () => {
    expect(matchesWhen(inDays(-2), "month", NOW)).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts difficulty + surface + a non-any when", () => {
    expect(activeFilterCount(crit())).toBe(0);
    expect(activeFilterCount(crit({ difficulty: ["easy", "hard"], when: "week" }))).toBe(3);
    expect(activeFilterCount(crit({ surface: ["road"] }))).toBe(1);
  });
});

describe("applyFindRidesCriteria", () => {
  const rides = [
    ride({ name: "Dawn Patrol", level: "beginner", activityType: "road", startsAt: inDays(1) }),
    ride({ name: "Gravel Grind", level: "elite", activityType: "gravel", startsAt: inDays(5) }),
    ride({ name: "Sunday Spin", level: "masters", activityType: "road", startsAt: inDays(20) }),
  ];

  it("passes everything through with default criteria (sorted soonest)", () => {
    const out = applyFindRidesCriteria(rides, crit(), NOW);
    expect(out.map((r) => r.name)).toEqual(["Dawn Patrol", "Gravel Grind", "Sunday Spin"]);
  });

  it("filters by difficulty bucket", () => {
    const out = applyFindRidesCriteria(rides, crit({ difficulty: ["hard"] }), NOW);
    expect(out.map((r) => r.name)).toEqual(["Gravel Grind"]);
  });

  it("filters by surface", () => {
    const out = applyFindRidesCriteria(rides, crit({ surface: ["road"] }), NOW);
    expect(out.map((r) => r.name)).toEqual(["Dawn Patrol", "Sunday Spin"]);
  });

  it("filters by when", () => {
    const out = applyFindRidesCriteria(rides, crit({ when: "week" }), NOW);
    expect(out.map((r) => r.name)).toEqual(["Dawn Patrol", "Gravel Grind"]);
  });

  it("filters by search over name and location", () => {
    const out = applyFindRidesCriteria(rides, crit({ search: "gravel" }), NOW);
    expect(out.map((r) => r.name)).toEqual(["Gravel Grind"]);
  });

  it("sorts hardest first, unknown level last", () => {
    const withUnknown = [...rides, ride({ name: "Mystery", level: null, startsAt: inDays(2) })];
    const out = applyFindRidesCriteria(withUnknown, crit({ sort: "hardest" }), NOW);
    expect(out[0].name).toBe("Gravel Grind");
    expect(out[out.length - 1].name).toBe("Mystery");
  });

  it("does not mutate the input array", () => {
    const input = [...rides];
    applyFindRidesCriteria(input, crit({ sort: "name" }), NOW);
    expect(input.map((r) => r.name)).toEqual(["Dawn Patrol", "Gravel Grind", "Sunday Spin"]);
  });
});
