import { describe, expect, it } from "vitest";
import type { RideImageDto } from "../../store/rideImagesStore";
import { EXPECTED_DISTRIBUTION, promptSheet, STUDIO_IMAGES, type StudioImage } from "./catalog";
import { isIllustrativeCover, suggestCover, suggestCovers } from "./resolver";

describe("the 20-image library", () => {
  it("has exactly 20 images with unique ids and files", () => {
    expect(STUDIO_IMAGES).toHaveLength(20);
    expect(new Set(STUDIO_IMAGES.map((i) => i.id)).size).toBe(20);
    expect(new Set(STUDIO_IMAGES.map((i) => i.file)).size).toBe(20);
  });

  it("matches the planned distribution", () => {
    const counts: Record<string, number> = {};
    for (const i of STUDIO_IMAGES)
      counts[`${i.rideType}|${i.continent}`] = (counts[`${i.rideType}|${i.continent}`] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_DISTRIBUTION);
  });

  it("is honest: no file is claimed, every image is marked as illustrative artwork", () => {
    for (const i of STUDIO_IMAGES) {
      expect(i.provenance).toBe("ai-illustration");
      expect(i.status).toBe("prompt-ready");
      expect(i.registryKey).toBeNull();
      expect(i.fileSizeBytes).toBeNull();
      expect(i.source).toMatch(/AI-generated/);
      expect(i.width / i.height).toBeCloseTo(16 / 9, 2);
    }
  });

  it("every prompt carries the shared art direction and the no-text rule", () => {
    for (const i of STUDIO_IMAGES) {
      expect(i.prompt).toMatch(/No text, no logos, no watermarks/);
      expect(i.prompt.length).toBeGreaterThan(160);
    }
    expect(promptSheet()).toContain("rs-road-il-jerusalem-hills");
  });

  it("covers Israeli regions it names with real region keys", () => {
    const keys = new Set([
      "jerusalem",
      "golan",
      "sharon",
      "upper_galilee",
      "carmel",
      "gilboa_valleys",
      "negev",
      "arava",
    ]);
    for (const i of STUDIO_IMAGES.filter((x) => x.country === "IL"))
      expect(keys.has(i.region ?? "")).toBe(true);
  });
});

const dto = (key: string, category: string, selectable = true): RideImageDto => ({
  key,
  url: `/ride-images/${key}.webp`,
  label: key,
  category,
  selectable,
});

const registry: RideImageDto[] = [
  dto("road-a", "road"),
  dto("mtb-a", "mtb"),
  dto("gravel-a", "gravel"),
  dto("gen-a", "generic"),
  dto("off", "road", false),
  dto("hills-road", "road"),
  dto("negev-gravel", "gravel"),
  dto("ch-road", "road"),
  dto("any-sun", "generic"),
];

/** A library where some images are uploaded (ready) so the upper rungs can be exercised. */
function library(): StudioImage[] {
  const ready: Record<string, string> = {
    "rs-road-il-jerusalem-hills": "hills-road",
    "rs-gravel-il-negev": "negev-gravel",
    "rs-road-ch-alps": "ch-road",
    "rs-any-sunrise": "any-sun",
  };
  return STUDIO_IMAGES.map((i) =>
    ready[i.id] ? { ...i, status: "ready", registryKey: ready[i.id] } : i,
  );
}

describe("choosing a cover", () => {
  it("only labels the library's own AI artwork as illustrative, never the app's existing covers", () => {
    expect(isIllustrativeCover("hills-road", library())).toBe(true);
    expect(isIllustrativeCover("road-a", library())).toBe(false);
    expect(isIllustrativeCover("tikva1", library())).toBe(false);
    expect(isIllustrativeCover(null, library())).toBe(false);
    expect(isIllustrativeCover("hills-road")).toBe(false); // nothing is generated yet
  });

  it("until the library exists, falls back to the registry's covers for the ride type", () => {
    const pick = suggestCover({ rideType: "mtb", country: "IL", region: "carmel" }, registry);
    expect(pick).toMatchObject({ key: "mtb-a", tier: "registry", illustrative: false });
    expect(suggestCover({ rideType: "running", country: null, region: null }, registry)?.key).toBe(
      "gen-a",
    );
  });

  it("1. prefers the exact region and type", () => {
    const [first] = suggestCovers(
      { rideType: "road", country: "IL", region: "jerusalem" },
      registry,
      4,
      library(),
    );
    expect(first).toMatchObject({
      key: "hills-road",
      tier: "region",
      imageId: "rs-road-il-jerusalem-hills",
      illustrative: true,
    });
  });

  it("2. then a similar landscape, when the region has no image of its own", () => {
    // shfela is hills + farmland; the Jerusalem hills picture is the nearest road scene.
    const [first] = suggestCovers(
      { rideType: "road", country: "IL", region: "shfela" },
      registry,
      4,
      library(),
    );
    expect(first).toMatchObject({ key: "hills-road", tier: "landscape" });
  });

  it("3. then the country, 4. then the type anywhere", () => {
    const israelRoad = suggestCovers(
      { rideType: "road", country: "IL", region: null },
      registry,
      4,
      library(),
    );
    expect(israelRoad[0]).toMatchObject({ key: "hills-road", tier: "country" });
    const swiss = suggestCovers(
      { rideType: "road", country: "CH", region: null },
      registry,
      4,
      library(),
    );
    expect(swiss[0]).toMatchObject({ key: "ch-road", tier: "country" });
    const unknownCountry = suggestCovers(
      { rideType: "road", country: "NZ", region: null },
      registry,
      4,
      library(),
    );
    expect(unknownCountry[0].tier).toBe("type");
  });

  it("5. then the neutral image, 6. then the registry", () => {
    const mtb = suggestCovers(
      { rideType: "mtb", country: "IL", region: null },
      registry,
      4,
      library(),
    );
    expect(mtb.map((s) => s.tier)).toEqual(["neutral", "registry", "registry", "registry"]);
    expect(mtb[0].key).toBe("any-sun");
  });

  it("never offers an image an administrator has disabled, or one not in the registry", () => {
    const disabled = registry.map((r) =>
      r.key === "hills-road" ? { ...r, selectable: false } : r,
    );
    const keys = suggestCovers(
      { rideType: "road", country: "IL", region: "jerusalem" },
      disabled,
      10,
      library(),
    ).map((s) => s.key);
    expect(keys).not.toContain("hills-road");
    expect(keys).not.toContain("off");
    const gone = suggestCovers(
      { rideType: "road", country: "IL", region: "jerusalem" },
      [dto("road-a", "road")],
      10,
      library(),
    );
    expect(gone.map((s) => s.key)).toEqual(["road-a"]);
  });

  it("offers alternatives with no duplicates, best first, capped", () => {
    const list = suggestCovers(
      { rideType: "road", country: "IL", region: "jerusalem" },
      registry,
      3,
      library(),
    );
    expect(list).toHaveLength(3);
    expect(new Set(list.map((s) => s.key)).size).toBe(3);
  });

  it("is instant and safe with no registry yet, and with no ride type", () => {
    expect(suggestCover({ rideType: "road", country: "IL", region: null }, null)).toBeNull();
    expect(
      suggestCovers({ rideType: null, country: null, region: null }, registry, 2).map((s) => s.key),
    ).toEqual(["gen-a", "any-sun"]);
  });
});
