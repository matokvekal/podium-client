import { describe, expect, it } from "vitest";
import { scaledSize, shrinkImageForUpload } from "./shrink-image-for-upload";

describe("scaledSize", () => {
  it("scales the longest side down to the limit, keeping the aspect ratio", () => {
    expect(scaledSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledSize(3000, 6000, 2000)).toEqual({ width: 1000, height: 2000 });
  });
  it("never upscales", () => {
    expect(scaledSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkImageForUpload", () => {
  it("sends a small file exactly as it is", async () => {
    const small = new File([new Uint8Array(1000)], "a.png", { type: "image/png" });
    expect(await shrinkImageForUpload(small)).toBe(small);
  });

  it("refuses a source over 4 MB without trying to decode it", async () => {
    const huge = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await expect(shrinkImageForUpload(huge)).rejects.toThrow(/4 MB/);
  });
});
