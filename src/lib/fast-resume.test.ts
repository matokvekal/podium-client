/**
 * @vitest-environment jsdom
 */

// Fast Resume: when reopening the app returns you to where you were, and when it must not.
//
// The rule lives in one pure function (resumeRouteFor) precisely so it can be stated here in
// full, without a browser, a router or a clock. Three things must all hold — the flag is on,
// there is a real session, and the last visit was inside the window — and each of the tests
// below removes exactly one of them.
//
// The safety half matters more than the convenience half: this decides a NAVIGATION taken
// before the rider touches anything, so a route that could bounce them back into sign-in, or
// off this origin entirely, must never come back out of storage.

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearResumeState,
  FAST_RESUME_ENABLED,
  FAST_RESUME_STORAGE_KEY,
  isSafeResumeRoute,
  parseResumeState,
  recordResumeState,
  RESUME_MAX_AGE_MS,
  resumeRouteFor,
} from "./fast-resume";
import { isOwnedStorageKey } from "./logout-cleanup";

const NOW = new Date("2026-09-18T09:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

function stored(): string | null {
  return window.localStorage.getItem(FAST_RESUME_STORAGE_KEY);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("resuming", () => {
  it("returns the last route for a signed-in rider who was here an hour ago", () => {
    const state = { route: "/events/abc", lastActive: NOW - HOUR };
    expect(resumeRouteFor(state, { now: NOW, signedIn: true })).toBe("/events/abc");
  });

  it("resumes right up to the 12-hour edge", () => {
    const state = { route: "/events/abc", lastActive: NOW - RESUME_MAX_AGE_MS };
    expect(resumeRouteFor(state, { now: NOW, signedIn: true })).toBe("/events/abc");
  });

  it("⚠ does NOT resume once the last visit is older than 12 hours", () => {
    const state = { route: "/events/abc", lastActive: NOW - RESUME_MAX_AGE_MS - 1 };
    expect(resumeRouteFor(state, { now: NOW, signedIn: true })).toBeNull();
  });

  it("⚠ does NOT resume without a session — a stored route is never proof of one", () => {
    // The whole point: this state is a route and a timestamp. `signedIn` comes from the real
    // tokens (lib/auth-storage.ts hasSession), and with no session there is nothing to resume
    // into — the app starts normally and its own guards send the rider to sign in.
    const state = { route: "/events/abc", lastActive: NOW - HOUR };
    expect(resumeRouteFor(state, { now: NOW, signedIn: false })).toBeNull();
  });

  it("does not resume when there is no state at all", () => {
    expect(resumeRouteFor(null, { now: NOW, signedIn: true })).toBeNull();
  });

  it("refuses a timestamp in the future, which is a clock that moved, not a recent visit", () => {
    const state = { route: "/events/abc", lastActive: NOW + HOUR };
    expect(resumeRouteFor(state, { now: NOW, signedIn: true })).toBeNull();
  });

  it("⚠ with FAST_RESUME_ENABLED off, nothing resumes however fresh and valid it is", () => {
    const state = { route: "/events/abc", lastActive: NOW };
    expect(resumeRouteFor(state, { now: NOW, signedIn: true, enabled: false })).toBeNull();
  });

  it("ships enabled", () => {
    // If this ever fails, Fast Resume was turned off deliberately — which is exactly what the
    // flag is for. It is asserted so the switch cannot be flipped by accident and unnoticed.
    expect(FAST_RESUME_ENABLED).toBe(true);
  });
});

describe("which routes may be restored", () => {
  it("accepts an ordinary in-app path, with its query", () => {
    expect(isSafeResumeRoute("/events/abc")).toBe(true);
    expect(isSafeResumeRoute("/tracks?country=IL")).toBe(true);
  });

  it("⚠ refuses sign-in and the profile-setup detour, which is how a redirect loop starts", () => {
    expect(isSafeResumeRoute("/login")).toBe(false);
    expect(isSafeResumeRoute("/account/setup")).toBe(false);
    expect(isSafeResumeRoute("/logout")).toBe(false);
    expect(isSafeResumeRoute("/auth/callback")).toBe(false);
  });

  it("refuses anything that is not an in-app absolute path", () => {
    expect(isSafeResumeRoute("https://evil.example/x")).toBe(false);
    // Protocol-relative: a router reads it as a path, a browser as another origin.
    expect(isSafeResumeRoute("//evil.example")).toBe(false);
    expect(isSafeResumeRoute("/\\evil.example")).toBe(false);
    expect(isSafeResumeRoute("events/abc")).toBe(false);
    expect(isSafeResumeRoute("")).toBe(false);
    expect(isSafeResumeRoute(undefined)).toBe(false);
  });

  it("keeps an account PAGE resumable — only the setup detour is off limits", () => {
    expect(isSafeResumeRoute("/account")).toBe(true);
  });
});

describe("reading what was stored", () => {
  it("rejects junk, a missing timestamp and an unsafe route alike", () => {
    expect(parseResumeState(null)).toBeNull();
    expect(parseResumeState("not json")).toBeNull();
    expect(parseResumeState(JSON.stringify({ route: "/events/abc" }))).toBeNull();
    expect(parseResumeState(JSON.stringify({ lastActive: NOW }))).toBeNull();
    expect(parseResumeState(JSON.stringify({ route: "/login", lastActive: NOW }))).toBeNull();
  });

  it("reads back exactly what was written", () => {
    expect(parseResumeState(JSON.stringify({ route: "/events/abc", lastActive: NOW }))).toEqual({
      route: "/events/abc",
      lastActive: NOW,
    });
  });
});

describe("writing it", () => {
  it("stores the route and the moment", () => {
    recordResumeState("/events/abc", NOW);
    expect(JSON.parse(stored() ?? "null")).toEqual({ route: "/events/abc", lastActive: NOW });
  });

  it("⚠ never stores an unsafe route, so one cannot be resumed to later", () => {
    recordResumeState("/login", NOW);
    expect(stored()).toBeNull();
  });

  it("clears on request", () => {
    recordResumeState("/events/abc", NOW);
    clearResumeState();
    expect(stored()).toBeNull();
  });

  it("⚠ is cleared by logout, because its key is one this app owns", () => {
    // Logout wipes every `podium.*` / `elnino.*` key (lib/logout-cleanup.ts). That is the ONLY
    // cleanup path, deliberately — a second one is a second thing to forget. This test is what
    // keeps the key named so that scan takes it.
    expect(isOwnedStorageKey(FAST_RESUME_STORAGE_KEY)).toBe(true);
  });
});
