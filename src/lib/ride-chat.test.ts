import { describe, expect, it } from "vitest";
import {
  buildUnreadQuery,
  canOpenRideChat,
  formatChatTime,
  latestRideChatId,
  mergeRideChatMessages,
  type RideChatMessage,
  rideChatTextProblem,
  unreadBadgeText,
} from "./ride-chat";

function msg(id: number, text = `m${id}`): RideChatMessage {
  return {
    id,
    userId: 1,
    userName: "Gilad",
    isOrganizer: false,
    text,
    createdAt: "2026-09-23T06:42:00Z",
  };
}

describe("mergeRideChatMessages — polling adds only new messages", () => {
  it("appends newer messages in id order", () => {
    const merged = mergeRideChatMessages([msg(1), msg(2)], [msg(4), msg(3)]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("never duplicates a message the rider's own send already added", () => {
    const afterSend = mergeRideChatMessages([msg(1)], [msg(2)]);
    const afterPoll = mergeRideChatMessages(afterSend, [msg(2), msg(3)]);
    expect(afterPoll.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("returns the same array when nothing is new (no needless re-render)", () => {
    const current = [msg(1), msg(2)];
    expect(mergeRideChatMessages(current, [msg(2)])).toBe(current);
    expect(mergeRideChatMessages(current, [])).toBe(current);
  });
});

describe("latestRideChatId", () => {
  it("is the polling cursor — 0 for an empty chat", () => {
    expect(latestRideChatId([])).toBe(0);
    expect(latestRideChatId([msg(5), msg(9), msg(7)])).toBe(9);
  });
});

describe("rideChatTextProblem", () => {
  it("mirrors the server: trimmed, non-empty, at most 500", () => {
    expect(rideChatTextProblem("   ")).toBe("empty");
    expect(rideChatTextProblem("x".repeat(500))).toBeNull();
    expect(rideChatTextProblem(` ${"x".repeat(500)} `)).toBeNull();
    expect(rideChatTextProblem("x".repeat(501))).toBe("too-long");
  });
});

describe("unread badge", () => {
  it("shows the count, and 99+ at the server's cap", () => {
    expect(unreadBadgeText(3)).toBe("3");
    expect(unreadBadgeText(100)).toBe("99+");
  });

  it("asks for every ride in one query string with its last-read id", () => {
    expect(buildUnreadQuery(["a", "b"], { a: 18442 })).toBe("a:18442,b:0");
  });
});

describe("canOpenRideChat", () => {
  it("follows the server's capability when it is sent", () => {
    expect(canOpenRideChat({ capabilities: ["event:view", "event:chat"] })).toBe(true);
    expect(canOpenRideChat({ capabilities: ["event:view"], isOwner: true })).toBe(false);
  });

  it("falls back to organizer / confirmed rider for an older server", () => {
    expect(canOpenRideChat({ isOwner: true })).toBe(true);
    expect(canOpenRideChat({ myParticipant: { registrationStatus: "approved" } })).toBe(true);
    expect(canOpenRideChat({ myParticipant: { registrationStatus: "waiting_approval" } })).toBe(
      false,
    );
    expect(canOpenRideChat({})).toBe(false);
  });
});

describe("formatChatTime", () => {
  it("shows only the time for a message from today", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    const sent = new Date(2026, 8, 23, 6, 42).toISOString();
    expect(formatChatTime(sent, now)).toMatch(/06:42/);
    expect(formatChatTime(sent, now)).not.toMatch(/Sep/);
  });

  it("adds the day for an older message (History)", () => {
    const now = new Date(2026, 8, 23, 12, 0);
    const sent = new Date(2026, 8, 20, 6, 42).toISOString();
    expect(formatChatTime(sent, now)).toMatch(/06:42/);
    expect(formatChatTime(sent, now).length).toBeGreaterThan(5);
  });
});
