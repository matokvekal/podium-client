import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getRideImage,
  RIDE_IMAGES,
  rideImagesByCategory,
  selectableRideImages,
} from "./ride-images";

describe("registry integrity", () => {
  it("has no duplicate keys", () => {
    const keys = RIDE_IMAGES.map((img) => img.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names every file after its key", () => {
    for (const img of RIDE_IMAGES) {
      expect(img.src).toBe(`/ride-images/${img.key}.webp`);
    }
  });

  // The one failure mode a hand-listed registry actually produces.
  it("points every src at a file that exists on disk", () => {
    for (const img of RIDE_IMAGES) {
      expect(existsSync(`public${img.src}`), `missing asset for ${img.key}`).toBe(true);
    }
  });
});

describe("lookup", () => {
  it("returns null for an unknown/missing key rather than throwing", () => {
    // The forward/backward-compat case: a ride carries a key this build does not (or no
    // longer) recognize — a retired image or one added by a newer client.
    expect(getRideImage("sukkot-invented-by-a-newer-client")).toBeNull();
    expect(getRideImage("")).toBeNull();
    expect(getRideImage(null)).toBeNull();
    expect(getRideImage(undefined)).toBeNull();
  });

  it("resolves every registry key", () => {
    for (const img of RIDE_IMAGES) {
      expect(getRideImage(img.key)?.key).toBe(img.key);
    }
  });
});

describe("selectableRideImages", () => {
  it("excludes anything flagged selectable: false", () => {
    for (const img of selectableRideImages()) {
      expect(img.selectable).not.toBe(false);
    }
  });

  it("is a subset of the full registry", () => {
    const all = new Set(RIDE_IMAGES.map((img) => img.key));
    for (const img of selectableRideImages()) expect(all.has(img.key)).toBe(true);
  });
});

describe("rideImagesByCategory", () => {
  it("groups without empty groups, and never mixes categories", () => {
    for (const group of rideImagesByCategory()) {
      expect(group.images.length).toBeGreaterThan(0);
      expect(group.images.every((img) => img.category === group.category)).toBe(true);
    }
  });
});
