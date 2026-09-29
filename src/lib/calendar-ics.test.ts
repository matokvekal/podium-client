import { describe, expect, it } from "vitest";
import { buildEventIcs, canAddToCalendar } from "./calendar-ics";

const base = {
  id: "ev1",
  name: "Dawn Patrol",
  startsAt: "2026-10-16T03:00:00.000Z",
  url: "https://el-nino.site/events/ev1",
};
const NOW = new Date("2026-09-29T10:00:00.000Z");

describe("buildEventIcs", () => {
  it("writes the start as the same UTC instant, never a local time", () => {
    const ics = buildEventIcs(base, NOW) as string;
    expect(ics).toContain("DTSTART:20261016T030000Z");
    expect(ics).toContain("SUMMARY:Dawn Patrol");
    expect(ics).toContain("URL:https://el-nino.site/events/ev1");
    expect(ics).toContain("Event details: https://el-nino.site/events/ev1");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("includes DTEND only when a valid later end exists", () => {
    expect(buildEventIcs(base, NOW)).not.toContain("DTEND");
    expect(buildEventIcs({ ...base, endsAt: "2026-10-16T01:00:00.000Z" }, NOW)).not.toContain(
      "DTEND",
    );
    expect(buildEventIcs({ ...base, endsAt: "2026-10-16T06:30:00.000Z" }, NOW)).toContain(
      "DTEND:20261016T063000Z",
    );
  });

  it("includes the meeting point when present and escapes special characters", () => {
    const ics = buildEventIcs({ ...base, location: "Park, north; gate" }, NOW) as string;
    expect(ics).toContain("LOCATION:Park\\, north\\; gate");
    expect(buildEventIcs(base, NOW)).not.toContain("LOCATION");
  });

  it("returns null without a usable start", () => {
    expect(buildEventIcs({ ...base, startsAt: null }, NOW)).toBeNull();
    expect(buildEventIcs({ ...base, startsAt: "nope" }, NOW)).toBeNull();
  });
});

describe("canAddToCalendar", () => {
  it("shows for the owner and for PROMOTE rides without registration", () => {
    expect(canAddToCalendar({ isOwner: true })).toBe(true);
    expect(canAddToCalendar({ promoteOnly: true, myParticipant: null })).toBe(true);
  });

  it("shows for registered/approved riders only", () => {
    expect(canAddToCalendar({ myParticipant: { registrationStatus: "approved" } })).toBe(true);
    expect(canAddToCalendar({ myParticipant: { registrationStatus: "registered" } })).toBe(true);
    expect(canAddToCalendar({ myParticipant: { registrationStatus: "waiting_approval" } })).toBe(
      false,
    );
    expect(canAddToCalendar({ myParticipant: { registrationStatus: "rejected" } })).toBe(false);
  });

  it("hides for a rider who left and for non-participants", () => {
    expect(canAddToCalendar({ isOwner: false, myParticipant: null })).toBe(false);
    expect(canAddToCalendar({})).toBe(false);
  });
});
