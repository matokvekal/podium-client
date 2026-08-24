import { describe, expect, it } from "vitest";
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_SPEC,
  COVER_SPEC,
  ImageProcessingError,
  isAnimatedGif,
} from "./image-processing";

/**
 * Canvas/FileReader work needs a DOM, and this repo deliberately has no jsdom (see the plan's
 * verification note). What IS pure — and what actually decides whether a rider's animation
 * survives — is the GIF byte sniffing and the spec numbers, so that is what is covered here.
 */

const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // "GIF89a"
const gce = [0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00];

function gif(frames: number): Uint8Array {
  const bytes = [...GIF_HEADER, 0x10, 0x00, 0x10, 0x00];
  for (let i = 0; i < frames; i++) bytes.push(...gce, 0x2c, 0x00, 0x00);
  return new Uint8Array(bytes);
}

describe("isAnimatedGif", () => {
  it("says yes for a multi-frame GIF", () => {
    expect(isAnimatedGif(gif(2))).toBe(true);
    expect(isAnimatedGif(gif(24))).toBe(true);
  });

  it("says no for a single-frame GIF", () => {
    expect(isAnimatedGif(gif(1))).toBe(false);
    expect(isAnimatedGif(gif(0))).toBe(false);
  });

  it("says no for anything that is not a GIF", () => {
    // A JPEG's leading bytes, and a PNG's.
    expect(isAnimatedGif(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe(false);
    expect(isAnimatedGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
  });

  it("does not crash on a truncated or empty file", () => {
    expect(isAnimatedGif(new Uint8Array([]))).toBe(false);
    expect(isAnimatedGif(new Uint8Array([0x47, 0x49]))).toBe(false);
  });

  it("accepts GIF87a as well as GIF89a", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, ...gce, ...gce]);
    expect(isAnimatedGif(bytes)).toBe(true);
  });
});

describe("specs", () => {
  it("matches the agreed avatar targets", () => {
    expect(AVATAR_SPEC.maxWidth).toBe(256);
    expect(AVATAR_SPEC.maxHeight).toBe(256);
    expect(AVATAR_SPEC.aspectRatio).toBe(1);
    expect(AVATAR_SPEC.maxBytes).toBe(20 * 1024);
  });

  it("matches the agreed cover targets", () => {
    expect(COVER_SPEC.maxWidth).toBe(1200);
    expect(COVER_SPEC.maxHeight).toBe(450);
    expect(COVER_SPEC.aspectRatio).toBeCloseTo(8 / 3, 5);
    expect(COVER_SPEC.maxBytes).toBe(100 * 1024);
  });

  it("gives animated GIFs a larger budget, since they cannot be recompressed", () => {
    expect(AVATAR_SPEC.animatedMaxBytes).toBeGreaterThan(AVATAR_SPEC.maxBytes);
    expect(COVER_SPEC.animatedMaxBytes).toBeGreaterThan(COVER_SPEC.maxBytes);
  });

  it("terminates the quality loop", () => {
    // quality walks down by 0.08 while > minQuality, so both must be sane or it never ends.
    for (const spec of [AVATAR_SPEC, COVER_SPEC]) {
      expect(spec.quality).toBeGreaterThan(spec.minQuality);
      expect(spec.minQuality).toBeGreaterThan(0);
    }
  });

  it("accepts exactly the four documented input formats", () => {
    expect([...ACCEPTED_IMAGE_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
  });
});

describe("ImageProcessingError", () => {
  it("flags the oversized-animation case as offerable-to-flatten", () => {
    const err = new ImageProcessingError("animated-too-large", "too big", true);
    expect(err).toBeInstanceOf(Error); // EventCreatePage checks `instanceof Error`
    expect(err.canFlatten).toBe(true);
    expect(err.problem).toBe("animated-too-large");
  });

  it("does not offer flattening for an ordinary oversized still", () => {
    expect(new ImageProcessingError("too-large", "too big").canFlatten).toBe(false);
  });
});
