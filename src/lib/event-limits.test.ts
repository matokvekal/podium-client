// descriptionForRequest exists because of a specific bug: a description could be replaced but
// never REMOVED. The client sent `description || undefined`, JSON.stringify dropped the key, the
// server read an absent key as "leave it alone", and the old text came back on the next load.
//
// The distinction these pin — null for empty, never undefined — is one third of the fix; the
// other two thirds are the nullable schema and the CASE in updateEvent (server-side tests).

import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX_CHARS, descriptionForRequest } from "./event-limits";

describe("descriptionForRequest", () => {
  it("sends null for an emptied field, so the server clears the stored description", () => {
    expect(descriptionForRequest("")).toBeNull();
  });

  it("sends null for a whitespace-only field too", () => {
    expect(descriptionForRequest("   \n  ")).toBeNull();
  });

  it("never returns undefined — an omitted key means 'leave it alone' to the server", () => {
    // The actual regression: `"" || undefined` is undefined, JSON drops the key, nothing clears.
    expect(descriptionForRequest("")).not.toBeUndefined();
  });

  it("sends the text for a real description, trimmed", () => {
    expect(descriptionForRequest("  06:00 from the square  ")).toBe("06:00 from the square");
  });

  it("keeps interior line breaks — they are the structure of a ride plan", () => {
    expect(descriptionForRequest("  06:00 meet\n06:30 roll out  ")).toBe(
      "06:00 meet\n06:30 roll out",
    );
  });

  it("does not truncate at the limit — length is the validator's job, not this one's", () => {
    const tooLong = "x".repeat(DESCRIPTION_MAX_CHARS + 50);

    expect(descriptionForRequest(tooLong)).toHaveLength(DESCRIPTION_MAX_CHARS + 50);
  });
});
