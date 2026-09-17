// The invitation for 2-3 rides sharing one link (server: sql/037).
//
// This message has one job the single-ride one does not: make the reader see that there is a
// CHOICE before they tap. So the properties worth pinning are about what it says, not how it
// says it — the day once, every ride listed with its own time, and no placeholder for a fact
// nobody supplied.
//
// Times are asserted loosely (a time is present, in the right order) rather than as literal
// strings: formatLocalTime renders in the machine's own timezone, and a test that hardcoded
// "07:00" would pass in Israel and fail in CI.

import { describe, expect, it } from "vitest";
import { shareInviteMessageMulti, shareInviteTitleMulti } from "./share-invite";

/** 07:00 and 07:30 local, whatever zone this runs in — the long / short case. */
const LONG = { name: "Long loop", startsAt: new Date(2026, 8, 19, 7, 0).toISOString() };
const SHORT = { name: "Short loop", startsAt: new Date(2026, 8, 19, 7, 30).toISOString() };

describe("shareInviteMessageMulti", () => {
  it("says up front that there is a choice, and how many", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    expect(message).toContain("2 rides to choose from");
  });

  it("names every ride, in the order it was given", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    expect(message).toContain("Long loop");
    expect(message).toContain("Short loop");
    expect(message.indexOf("Long loop")).toBeLessThan(message.indexOf("Short loop"));
  });

  it("gives each ride its own time, since that is what differs between them", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    const long = message.split("\n").find((line) => line.includes("Long loop")) ?? "";
    const short = message.split("\n").find((line) => line.includes("Short loop")) ?? "";
    expect(long).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(short).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(long).not.toEqual(short);
  });

  it("states the day ONCE, in the heading — it is why the rides share a link at all", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    const dayLines = message.split("\n").filter((line) => line.includes("🗓️"));
    expect(dayLines).toHaveLength(1);
    expect(dayLines[0]).toContain("19");
  });

  it("states a shared start place once, when one was given", () => {
    const message = shareInviteMessageMulti({
      rides: [LONG, SHORT],
      location: "Park HaYarkon gate 3",
    });
    const placeLines = message.split("\n").filter((line) => line.includes("📍"));
    expect(placeLines).toHaveLength(1);
    expect(placeLines[0]).toContain("Park HaYarkon gate 3");
  });

  it("drops the place line entirely when there is none — never a '📍 —' placeholder", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    expect(message).not.toContain("📍");
  });

  it("drops the day line for rides with no start time rather than printing a dash", () => {
    const message = shareInviteMessageMulti({
      rides: [
        { name: "Long loop", startsAt: null },
        { name: "Short loop", startsAt: null },
      ],
    });
    expect(message).not.toContain("🗓️");
    expect(message).not.toContain("—\n");
    expect(message).toContain("Long loop");
  });

  it("puts the link in once, at the end, when the channel does not carry it separately", () => {
    const url = "https://el-nino.site/share/19092026A-19092026B";
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT], url });
    expect(message.split(url)).toHaveLength(2);
    expect(message.indexOf(url)).toBeGreaterThan(message.indexOf("Short loop"));
  });

  it("omits the link when navigator.share will pass it separately", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, SHORT] });
    expect(message).not.toContain("http");
  });

  it("ignores a blank ride name instead of printing an empty bullet", () => {
    const message = shareInviteMessageMulti({ rides: [LONG, { name: "   ", startsAt: null }] });
    expect(message).toContain("1 rides to choose from");
    expect(message).not.toMatch(/•\s*$/m);
  });

  it("handles three rides, the ceiling", () => {
    const message = shareInviteMessageMulti({
      rides: [LONG, SHORT, { name: "Gravel", startsAt: SHORT.startsAt }],
    });
    expect(message).toContain("3 rides to choose from");
    expect(message).toContain("Gravel");
  });

  it("keeps a Hebrew ride name on its own line, away from the English date", () => {
    // Same reason the single-ride message is built line by line: a RTL name and an LTR date
    // sharing a line fight over direction in a chat bubble.
    const message = shareInviteMessageMulti({
      rides: [{ name: "רכיבת בוקר ארוכה", startsAt: LONG.startsAt }, SHORT],
    });
    const line = message.split("\n").find((l) => l.includes("רכיבת בוקר ארוכה")) ?? "";
    expect(line).not.toContain("🗓️");
  });
});

describe("shareInviteTitleMulti", () => {
  it("says the count rather than naming one of the rides", () => {
    // "You're invited: Long loop" would name one of two rides and hide the other.
    expect(shareInviteTitleMulti(2)).toContain("2 rides");
    expect(shareInviteTitleMulti(2)).not.toContain("Long loop");
  });
});
