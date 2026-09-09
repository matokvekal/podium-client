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
