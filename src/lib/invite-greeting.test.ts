import { describe, expect, it } from "vitest";
import { inviteGreeting } from "./invite-greeting";

// Midday UTC so the formatted local date is the same calendar day in any plausible test
// timezone — the assertion is about the wording, not about timezone conversion (time.ts owns
// that, and has its own coverage).
const NOON = "2026-12-12T12:00:00.000Z";

describe("inviteGreeting", () => {
  it("greets a link recipient — they are being asked", () => {
    expect(inviteGreeting("abc Gravel ride", NOON, "link")).toBe(
      "You are invited to abc Gravel ride at 12 Dec 2026",
    );
  });

  it("addresses a QR scanner as someone already acting on it", () => {
    expect(inviteGreeting("abc Gravel ride", NOON, "qr")).toBe(
      "Join abc Gravel ride at 12 Dec 2026",
    );
  });

  it("treats a hand-typed code like a scan — both are deliberate", () => {
    expect(inviteGreeting("Dawn Patrol", NOON, "code")).toBe("Join Dawn Patrol at 12 Dec 2026");
  });

  it("falls back to the invited wording when the source was never recorded", () => {
    // Invites persisted before `via` existed. Greeting is the safe reading — it explains
    // itself to someone who may not know what this is, rather than assuming they do.
    expect(inviteGreeting("Dawn Patrol", NOON, undefined)).toBe(
      "You are invited to Dawn Patrol at 12 Dec 2026",
    );
  });

  it("drops the date rather than printing a placeholder into the sentence", () => {
    expect(inviteGreeting("Dawn Patrol", null, "link")).toBe("You are invited to Dawn Patrol");
    expect(inviteGreeting("Dawn Patrol", undefined, "qr")).toBe("Join Dawn Patrol");
  });

  it("trims a name with stray whitespace, as real event names have", () => {
    // The live ride "רכיבת שבת  מישור " is stored with a trailing space.
    expect(inviteGreeting("  Sunday Spin ", null, "qr")).toBe("Join Sunday Spin");
  });
});
