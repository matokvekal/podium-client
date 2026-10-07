// The description rule is the only one of these that mirrors a server limit, so it is the only
// one that can silently drift out of agreement with the server. These pin the boundary itself
// (at the cap, one over) and the trim, because the server trims before it measures — if the two
// disagreed, a description could pass here and still come back a 400.
//
// The name/startsAt/route rules are covered alongside it only where the description rule
// interacts with them: it must apply in edit mode too, where the others deliberately do not.

import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX_CHARS } from "../lib/event-limits";
import { type CreateEventFormValues, validateCreateEventForm } from "./forms";

function form(over: Partial<CreateEventFormValues> = {}): CreateEventFormValues {
  return {
    name: "Saturday ride",
    startsAt: "2026-09-12T06:00",
    // Pinned so the fixture date never turns into a past date as the calendar moves on.
    now: new Date("2026-09-01T00:00"),
    hasRoute: true,
    isEditing: false,
    description: "",
    ...over,
  };
}

describe("validateCreateEventForm description", () => {
  it("accepts no description at all — it has always been optional", () => {
    expect(validateCreateEventForm(form({ description: "" })).ok).toBe(true);
  });

  it("accepts a description of exactly the maximum length", () => {
    const result = validateCreateEventForm(
      form({ description: "x".repeat(DESCRIPTION_MAX_CHARS) }),
    );

    expect(result.ok).toBe(true);
    expect(result.errors.description).toBeUndefined();
  });

  it("rejects one character over the maximum", () => {
    const result = validateCreateEventForm(
      form({ description: "x".repeat(DESCRIPTION_MAX_CHARS + 1) }),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.description).toContain(String(DESCRIPTION_MAX_CHARS));
  });

  it("measures after trimming, matching the server", () => {
    // Exactly at the cap plus trailing whitespace. The server trims first, so this is a valid
    // description there and must not be blocked here.
    const result = validateCreateEventForm(
      form({ description: `${"x".repeat(DESCRIPTION_MAX_CHARS)}     ` }),
    );

    expect(result.ok).toBe(true);
  });

  it("counts characters, not bytes, so Hebrew is not penalised", () => {
    const result = validateCreateEventForm(
      form({ description: "א".repeat(DESCRIPTION_MAX_CHARS) }),
    );

    expect(result.ok).toBe(true);
  });

  it("applies in edit mode too, where name is the only other requirement", () => {
    const result = validateCreateEventForm(
      form({
        isEditing: true,
        startsAt: "",
        hasRoute: false,
        description: "x".repeat(DESCRIPTION_MAX_CHARS + 1),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.description).toBeDefined();
    // The rules edit mode deliberately drops stay dropped.
    expect(result.errors.startsAt).toBeUndefined();
    expect(result.errors.route).toBeUndefined();
  });

  it("does not invent a description requirement in either mode", () => {
    expect(validateCreateEventForm(form({ description: "   " })).ok).toBe(true);
    expect(validateCreateEventForm(form({ isEditing: true, description: "" })).ok).toBe(true);
  });
});

describe("validateCreateEventForm — start date in the past", () => {
  const now = new Date("2026-10-07T12:00");
  const base = { name: "Sovev Kinneret", hasRoute: true, description: "", now };

  it("refuses creating a ride on a past date", () => {
    const { ok, errors } = validateCreateEventForm({
      ...base,
      isEditing: false,
      startsAt: "2026-07-11T07:00",
    });
    expect(ok).toBe(false);
    expect(errors.startsAt).toMatch(/already passed/);
  });

  it("accepts a future date", () => {
    expect(
      validateCreateEventForm({ ...base, isEditing: false, startsAt: "2026-11-07T07:00" }).ok,
    ).toBe(true);
  });

  it("refuses an edit that moves the start into the past", () => {
    const { errors } = validateCreateEventForm({
      ...base,
      isEditing: true,
      originalStartsAt: "2026-11-07T07:00",
      startsAt: "2026-07-11T07:00",
    });
    expect(errors.startsAt).toMatch(/already passed/);
  });

  it("lets an edit keep an unchanged start that has already passed", () => {
    expect(
      validateCreateEventForm({
        ...base,
        isEditing: true,
        originalStartsAt: "2026-10-07T11:00",
        startsAt: "2026-10-07T11:00",
      }).ok,
    ).toBe(true);
  });

  it("reopening a never-started ride needs a new future date", () => {
    const stale = validateCreateEventForm({
      ...base,
      isEditing: true,
      mustBeFuture: true,
      originalStartsAt: "2026-07-11T07:00",
      startsAt: "2026-07-11T07:00",
    });
    expect(stale.ok).toBe(false);
    const fixed = validateCreateEventForm({
      ...base,
      isEditing: true,
      mustBeFuture: true,
      originalStartsAt: "2026-07-11T07:00",
      startsAt: "2026-11-07T07:00",
    });
    expect(fixed.ok).toBe(true);
  });
});
