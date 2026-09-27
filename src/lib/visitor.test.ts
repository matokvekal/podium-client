/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOwnedStorageKey } from "./logout-cleanup";
import { getOrCreateSessionId, getVisitorId, SESSION_IDLE_MS } from "./visitor";

beforeEach(() => {
  window.localStorage.clear();
});

describe("getVisitorId", () => {
  it("generates a UUID once and reuses it across calls", () => {
    const first = getVisitorId();
    const second = getVisitorId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).toBe(first);
  });

  it("survives what looks like a fresh page load (same storage, new call)", () => {
    const id = getVisitorId();
    // Simulate a reload: nothing clears storage, just call again.
    expect(getVisitorId()).toBe(id);
  });

  it("is not swept by logout-cleanup's owned-prefix scan", () => {
    const id = getVisitorId();
    const key = Object.keys(window.localStorage).find(
      (k) => window.localStorage.getItem(k) === id,
    );
    expect(key).toBeDefined();
    expect(isOwnedStorageKey(key as string)).toBe(false);
  });
});

describe("getOrCreateSessionId", () => {
  it("reuses the same session id within the idle window", () => {
    const t0 = Date.parse("2026-09-27T10:00:00Z");
    const first = getOrCreateSessionId(t0);
    const second = getOrCreateSessionId(t0 + SESSION_IDLE_MS - 1);
    expect(second).toBe(first);
  });

  it("starts a new session id after the idle window elapses", () => {
    const t0 = Date.parse("2026-09-27T10:00:00Z");
    const first = getOrCreateSessionId(t0);
    const second = getOrCreateSessionId(t0 + SESSION_IDLE_MS + 1);
    expect(second).not.toBe(first);
  });

  it("keeps refreshing lastActiveAt so a chain of small gaps never expires", () => {
    const t0 = Date.parse("2026-09-27T10:00:00Z");
    const first = getOrCreateSessionId(t0);
    const step = SESSION_IDLE_MS - 60_000;
    const second = getOrCreateSessionId(t0 + step);
    const third = getOrCreateSessionId(t0 + step * 2);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("falls back to crypto.randomUUID when storage throws (private mode)", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => getOrCreateSessionId()).not.toThrow();
    spy.mockRestore();
  });
});
