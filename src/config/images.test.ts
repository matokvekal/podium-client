import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPreset } from "../lib/identity-presets";
import { RIDE_IMAGES } from "../lib/ride-images";
import { resolveApiAssetUrl } from "../lib/ride-images-dynamic";
import { TYPE_IMAGES } from "../ride-studio/images/type-images";
import { currentImageUrl, IMAGE_DIRS, STARTUP_IMAGES } from "./images";

const PUBLIC = path.resolve(__dirname, "../../public");
const onDisk = (url: string) => existsSync(path.join(PUBLIC, url));

describe("image folders", () => {
  it("every folder named in the config exists under public/images/", () => {
    for (const dir of Object.values(IMAGE_DIRS)) expect(onDisk(dir), dir).toBe(true);
  });

  it("every built-in picture the code points at is really there", () => {
    for (const img of RIDE_IMAGES) expect(onDisk(img.src), img.src).toBe(true);
    for (const img of Object.values(TYPE_IMAGES)) expect(onDisk(img.src), img.src).toBe(true);
    expect(onDisk(STARTUP_IMAGES.splashPoster)).toBe(true);
    for (let i = 1; i <= 10; i++) expect(onDisk(`${IMAGE_DIRS.eventCovers}/cover-${i}.svg`)).toBe(true);
    for (const file of readdirSync(path.join(PUBLIC, IMAGE_DIRS.profileCovers))) {
      const preset = getPreset(file.replace(/\.svg$/, ""));
      if (preset) expect(onDisk(preset.url), preset.url).toBe(true);
    }
  });
});

describe("addresses written before the move", () => {
  it("an old built-in ride cover address (as the database holds it) finds the moved file", () => {
    expect(currentImageUrl("/ride-images/tikva1.webp")).toBe("/images/ride-covers/tikva1.webp");
    expect(resolveApiAssetUrl("/ride-images/tikva1.webp", "/api/v1")).toBe(
      "/images/ride-covers/tikva1.webp",
    );
    expect(onDisk(currentImageUrl("/ride-images/tikva1.webp"))).toBe(true);
  });

  it("leaves an admin upload, a full URL and a current path exactly as they are", () => {
    const upload = "/api/v1/ride-image-files/abc.webp";
    expect(currentImageUrl(upload)).toBe(upload);
    expect(resolveApiAssetUrl(upload, "/api/v1")).toBe(upload);
    expect(resolveApiAssetUrl(upload, "http://localhost:5000/api/v1")).toBe(
      "http://localhost:5000/api/v1/ride-image-files/abc.webp",
    );
    expect(currentImageUrl("https://cdn.example/x.webp")).toBe("https://cdn.example/x.webp");
    expect(currentImageUrl("/images/ride-covers/tikva1.webp")).toBe("/images/ride-covers/tikva1.webp");
  });
});
