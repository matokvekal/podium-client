// Explore Tracks home-page intro dismissal: per-rider where known, one flat device key for a
// signed-out visitor, and never throwing on bad/blocked storage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissExploreTracksIntro, isExploreTracksIntroDismissed } from "./explore-tracks-intro";
import { isOwnedStorageKey } from "./logout-cleanup";

/** Minimal in-memory localStorage — this suite runs in node. */
function installStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

let store: Map<string, string>;
beforeEach(() => {
  store = installStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isExploreTracksIntroDismissed", () => {
  it("is false for a rider/device that has never dismissed it", () => {
    expect(isExploreTracksIntroDismissed(7)).toBe(false);
    expect(isExploreTracksIntroDismissed(null)).toBe(false);
  });

  it("never throws when storage itself throws — reads as not dismissed", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(isExploreTracksIntroDismissed(7)).toBe(false);
    expect(() => dismissExploreTracksIntro(7)).not.toThrow();
  });
});

describe("dismissExploreTracksIntro", () => {
  it("is scoped per user — dismissing for one rider never affects another", () => {
    dismissExploreTracksIntro(1);
    expect(isExploreTracksIntroDismissed(1)).toBe(true);
    expect(isExploreTracksIntroDismissed(2)).toBe(false);
  });

  it("is permanent — round-trips across separate calls, same as re-reading after a reload", () => {
    dismissExploreTracksIntro(1);
    expect(isExploreTracksIntroDismissed(1)).toBe(true);
    expect(isExploreTracksIntroDismissed(1)).toBe(true);
  });

  it("signed-out uses one flat device key, distinct from any real userId", () => {
    dismissExploreTracksIntro(null);
    expect(isExploreTracksIntroDismissed(null)).toBe(true);
    expect(isExploreTracksIntroDismissed(1)).toBe(false);
    expect(store.has("elnino.exploreTracksIntro.v1.anon")).toBe(true);
    expect(store.has("elnino.exploreTracksIntro.v1.1")).toBe(false);
  });

  it("is wiped by logout cleanup (elnino. prefix)", () => {
    dismissExploreTracksIntro(1);
    for (const key of store.keys()) {
      expect(isOwnedStorageKey(key)).toBe(true);
    }
  });
});
