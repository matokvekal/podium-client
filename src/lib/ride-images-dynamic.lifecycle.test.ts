// The client half of the ride-image lifecycle: the server keeps a disabled/archived key in the
// catalog with selectable=false, so an existing ride still resolves it while the picker does not
// offer it; a replaced key comes back with a versioned URL.

import { describe, expect, it } from "vitest";
import type { RideImageDto } from "../store/rideImagesStore";
import { resolveApiAssetUrl, resolveRideImage, selectableFrom } from "./ride-images-dynamic";

const catalog: RideImageDto[] = [
  {
    key: "tikva1",
    url: "http://api/x/f2.webp?v=2",
    label: "Tikva",
    category: "generic",
    selectable: true,
    version: 2,
  },
  {
    key: "sukkot-01",
    url: "/ride-images/sukkot-01.webp",
    label: "Sukkot",
    category: "sukkot",
    selectable: false,
  },
];

describe("ride image catalog on the client", () => {
  it("resolves an existing ride's key even when it is no longer selectable", () => {
    expect(resolveRideImage(catalog, "sukkot-01")?.src).toBe("/ride-images/sukkot-01.webp");
  });

  it("offers only selectable images in the picker", () => {
    expect(selectableFrom(catalog).map((i) => i.key)).toEqual(["tikva1"]);
  });

  it("uses the versioned URL the server resolved for a replaced key — same key", () => {
    const image = resolveRideImage(catalog, "tikva1");
    expect(image?.key).toBe("tikva1");
    expect(image?.src).toBe("http://api/x/f2.webp?v=2");
  });
});

describe("resolveApiAssetUrl", () => {
  it("leaves the path alone when the API shares the site's origin (production)", () => {
    expect(resolveApiAssetUrl("/api/v1/ride-image-files/a.webp?v=2", "/api/v1")).toBe(
      "/api/v1/ride-image-files/a.webp?v=2",
    );
  });
  it("puts the API origin in front when the API is elsewhere (dev)", () => {
    expect(
      resolveApiAssetUrl("/api/v1/ride-image-files/a.webp", "http://localhost:5000/api/v1"),
    ).toBe("http://localhost:5000/api/v1/ride-image-files/a.webp");
  });
  it("never touches built-in covers or absolute URLs", () => {
    expect(resolveApiAssetUrl("/ride-images/tikva1.webp", "http://localhost:5000/api/v1")).toBe(
      "/ride-images/tikva1.webp",
    );
    expect(resolveApiAssetUrl("https://x/y.webp", "http://localhost:5000/api/v1")).toBe(
      "https://x/y.webp",
    );
  });
});
