import { describe, expect, it } from "vitest";
import { shareInviteMessage, shareInviteTitle } from "./share-invite";

// 5 Sep 2026 is a Saturday. Midday-ish UTC so the local calendar day is the same in any
// plausible test timezone — the assertions are about wording and structure, not conversion.
const SATURDAY = "2026-09-05T09:00:00.000Z";

describe("shareInviteMessage", () => {
  it("leads with the ride, then when, then where", () => {
    const message = shareInviteMessage({
      eventName: "Dawn Patrol",
      startsAt: SATURDAY,
      location: "Modi'in",
      url: "https://el-nino.site/join/31082026A",
    });
    const lines = message.split("\n");

    expect(lines[0]).toBe("🚴 Great news — you're invited to ride!");
    expect(lines[2]).toBe("Dawn Patrol");
    // The weekday leads the date line: riders hold a ride as "Saturday morning", not "the 5th".
    expect(lines[3]).toMatch(/^🗓️ Saturday, 5 Sep · /);
    expect(lines[4]).toBe("📍 Modi'in");
    expect(message).toContain("Tap to join 👉 https://el-nino.site/join/31082026A");
    expect(message.endsWith("See you on the road,\nEl Niño Ride")).toBe(true);
  });

  it("puts every fact on its own line", () => {
    // Not cosmetic: a Hebrew ride name and an English date sharing a line fight over direction
    // in a chat bubble and come out scrambled.
    const message = shareInviteMessage({
      eventName: "רכיבת שבת",
      startsAt: SATURDAY,
      location: "אירפורט סיטי",
      url: "https://el-nino.site/join/ABC",
    });
    expect(message).toContain("\nרכיבת שבת\n");
    expect(message).toContain("\n📍 אירפורט סיטי\n");
  });

  it("drops a missing date or place rather than printing a placeholder", () => {
    const message = shareInviteMessage({
      eventName: "Dawn Patrol",
      startsAt: null,
      location: null,
      url: "https://el-nino.site/join/ABC",
    });
    expect(message).not.toContain("🗓️");
    expect(message).not.toContain("📍");
    expect(message).not.toContain("—\n"); // never an em-dash stand-in for a fact
    expect(message).toContain("Dawn Patrol");
  });

  it("ignores an unparseable start time instead of printing Invalid Date", () => {
    const message = shareInviteMessage({
      eventName: "Dawn Patrol",
      startsAt: "not a date",
      location: null,
    });
    expect(message).not.toContain("Invalid");
    expect(message).not.toContain("🗓️");
  });

  it("omits the link line when the channel carries the URL separately", () => {
    // navigator.share takes `url` as its own field; repeating it in the text prints the link
    // twice in the bubble.
    const message = shareInviteMessage({
      eventName: "Dawn Patrol",
      startsAt: SATURDAY,
      location: "Modi'in",
    });
    expect(message).not.toContain("Tap to join");
    expect(message).not.toContain("http");
  });

  it("trims the stray whitespace real event names carry", () => {
    // The live ride is stored as "רכיבת שבת  מישור " — trailing space included.
    const message = shareInviteMessage({
      eventName: "  Dawn Patrol ",
      startsAt: null,
      location: "  ",
    });
    expect(message).toContain("\nDawn Patrol\n");
    // A location of pure whitespace is not a location.
    expect(message).not.toContain("📍");
  });
});

describe("shareInviteTitle", () => {
  it("names the ride, since a chat app shows this as the subject", () => {
    expect(shareInviteTitle("  Dawn Patrol ")).toBe("You're invited: Dawn Patrol");
  });
});
