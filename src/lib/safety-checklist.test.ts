// Storage for the rider's safety ticks: keyed by user + ride, by stable item id, and never
// throwing on bad data. The component behaviour on top of it is in
// app/SafetyChecklistLink.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOwnedStorageKey } from "./logout-cleanup";
import {
  parseSafetyChecks,
  readSafetyChecks,
  safetyChecklistKey,
  writeSafetyChecks,
} from "./safety-checklist";

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

describe("safetyChecklistKey", () => {
  it("is scoped by user AND ride", () => {
    expect(safetyChecklistKey(7, "ride-a")).toBe("elnino.safetyChecklist.v1.7.ride-a");
    expect(safetyChecklistKey(7, "ride-a")).not.toBe(safetyChecklistKey(8, "ride-a"));
    expect(safetyChecklistKey(7, "ride-a")).not.toBe(safetyChecklistKey(7, "ride-b"));
  });

  it("is wiped by logout cleanup", () => {
    expect(isOwnedStorageKey(safetyChecklistKey(7, "ride-a"))).toBe(true);
  });
});

describe("parseSafetyChecks", () => {
  it.each([
    ["missing", null],
    ["empty", ""],
    ["invalid JSON", "{nope"],
    ["a bare array (positions / old shape)", "[true,false,true]"],
    ["wrong schema", '{"checked":["helmet"]}'],
    ["ids not an array", '{"ids":"helmet"}'],
    ["JSON null", "null"],
    ["a number", "42"],
  ])("reads %s as nothing ticked", (_label, raw) => {
    expect(parseSafetyChecks(raw).size).toBe(0);
  });

  it("keeps known ids and drops unknown / non-string ones", () => {
    const got = parseSafetyChecks('{"ids":["helmet","jetpack",3,null,"water","helmet"]}');
    expect([...got].sort()).toEqual(["helmet", "water"]);
  });
});

describe("read / write", () => {
  it("round-trips by item id, per user + ride", () => {
    writeSafetyChecks(1, "a", new Set(["water", "helmet"]));
    expect(store.get("elnino.safetyChecklist.v1.1.a")).toBe('{"ids":["helmet","water"]}');
    expect([...readSafetyChecks(1, "a")].sort()).toEqual(["helmet", "water"]);
    expect(readSafetyChecks(1, "b").size).toBe(0);
    expect(readSafetyChecks(2, "a").size).toBe(0);
  });

  it("removes the key when nothing is ticked", () => {
    writeSafetyChecks(1, "a", new Set(["helmet"]));
    writeSafetyChecks(1, "a", new Set());
    expect(store.has("elnino.safetyChecklist.v1.1.a")).toBe(false);
  });

  it("never throws when storage itself throws", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(readSafetyChecks(1, "a").size).toBe(0);
    expect(() => writeSafetyChecks(1, "a", new Set(["helmet"]))).not.toThrow();
  });
});
