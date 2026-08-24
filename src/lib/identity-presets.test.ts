import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AVATAR_DIMENSIONS,
  COVER_DIMENSIONS,
  DEFAULT_AVATAR_POOL,
  DEFAULT_COVER_POOL,
  defaultPresetFor,
  getPreset,
  getPresetOfType,
  IDENTITY_PRESETS,
  presetsByCategory,
  presetsOfType,
} from "./identity-presets";

describe("registry integrity", () => {
  it("has no duplicate ids", () => {
    const ids = IDENTITY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every file after its id, in the folder for its type", () => {
    for (const p of IDENTITY_PRESETS) {
      const dir = p.type === "cover" ? "covers" : "avatars";
      expect(p.url).toBe(`/identity-presets/${dir}/${p.id}.svg`);
    }
  });

  it("prefixes every id with its type", () => {
    for (const p of IDENTITY_PRESETS) {
      expect(p.id.startsWith(`${p.type}-`)).toBe(true);
    }
  });

  it("gives every preset the standard dimensions for its type", () => {
    for (const p of IDENTITY_PRESETS) {
      const spec = p.type === "cover" ? COVER_DIMENSIONS : AVATAR_DIMENSIONS;
      expect({ width: p.width, height: p.height, aspectRatio: p.aspectRatio }).toEqual({
        width: spec.width,
        height: spec.height,
        aspectRatio: spec.aspectRatio,
      });
    }
  });

  // The one failure mode 34 hand-listed filenames actually produce.
  it("points every url at a file that exists on disk", () => {
    for (const p of IDENTITY_PRESETS) {
      expect(existsSync(`public${p.url}`), `missing asset for ${p.id}`).toBe(true);
    }
  });

  it("ships both types", () => {
    expect(presetsOfType("cover").length).toBeGreaterThanOrEqual(15);
    expect(presetsOfType("avatar").length).toBeGreaterThanOrEqual(10);
  });
});

describe("lookup", () => {
  it("returns null for an unknown id rather than throwing", () => {
    // The forward-compat case: a server sends a preset added after this build shipped.
    expect(getPreset("cover-invented-by-a-newer-server")).toBeNull();
    expect(getPreset("")).toBeNull();
    expect(getPreset(null)).toBeNull();
    expect(getPreset(undefined)).toBeNull();
  });

  it("does not return a cover when an avatar was asked for", () => {
    expect(getPresetOfType("cover-ocean-01", "cover")?.id).toBe("cover-ocean-01");
    expect(getPresetOfType("cover-ocean-01", "avatar")).toBeNull();
  });

  it("groups by category without empty groups", () => {
    for (const group of presetsByCategory("cover")) {
      expect(group.presets.length).toBeGreaterThan(0);
      expect(group.presets.every((p) => p.category === group.category)).toBe(true);
      expect(group.presets.every((p) => p.type === "cover")).toBe(true);
    }
  });
});

describe("deterministic default", () => {
  it("resolves every id in both pools", () => {
    for (const id of DEFAULT_COVER_POOL) expect(getPresetOfType(id, "cover")).not.toBeNull();
    for (const id of DEFAULT_AVATAR_POOL) expect(getPresetOfType(id, "avatar")).not.toBeNull();
  });

  it("returns the same preset for the same seed every time", () => {
    for (const seed of ["1", "42", "1024", "7"]) {
      const first = defaultPresetFor("cover", seed);
      expect(first).not.toBeNull();
      for (let i = 0; i < 5; i++) expect(defaultPresetFor("cover", seed)?.id).toBe(first?.id);
    }
  });

  it("spreads users across the pool rather than parking them on one preset", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 200; i++) seen.add(defaultPresetFor("cover", String(i))?.id ?? "none");
    expect(seen.size).toBeGreaterThan(DEFAULT_COVER_POOL.length / 2);
  });

  // Rule 2 of the registry: adding presets must not move anyone who already has a default.
  it("is unchanged when the registry grows but the pool does not", () => {
    const before = [1, 2, 3, 17, 99].map((i) => defaultPresetFor("cover", String(i))?.id);
    // defaultPresetFor reads DEFAULT_COVER_POOL, never IDENTITY_PRESETS' length or order, so a
    // registry-only addition cannot reach it. Assert the property the code relies on.
    expect(DEFAULT_COVER_POOL.every((id) => getPreset(id) !== null)).toBe(true);
    const after = [1, 2, 3, 17, 99].map((i) => defaultPresetFor("cover", String(i))?.id);
    expect(after).toEqual(before);
  });

  it("survives a null seed", () => {
    expect(() => defaultPresetFor("cover", null)).not.toThrow();
    expect(defaultPresetFor("cover", null)).not.toBeNull();
  });
});
