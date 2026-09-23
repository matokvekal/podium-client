import { describe, expect, it } from "vitest";
import {
  buildFindTracksPath,
  enumerateFindTracksFacets,
  findTracksDescription,
  findTracksHeadline,
  findTracksTitle,
  parseFindTracksPath,
} from "./find-tracks-url";

describe("parseFindTracksPath", () => {
  it("reads the bare page", () => {
    expect(parseFindTracksPath(undefined)).toEqual({
      facets: {},
      valid: true,
      canonicalPath: "/findtracks",
    });
    expect(parseFindTracksPath("").valid).toBe(true);
  });

  it("reads country and type", () => {
    expect(parseFindTracksPath("il/mtb")).toEqual({
      facets: { country: "IL", type: "mtb" },
      valid: true,
      canonicalPath: "/findtracks/il/mtb",
    });
  });

  it("reads 'all' as any country", () => {
    const parsed = parseFindTracksPath("all/road");
    expect(parsed.facets).toEqual({ country: null, type: "road" });
    expect(parsed.canonicalPath).toBe("/findtracks/all/road");
  });

  it("is case-insensitive and canonicalises to lowercase", () => {
    const parsed = parseFindTracksPath("IL/MTB");
    expect(parsed.valid).toBe(true);
    expect(parsed.canonicalPath).toBe("/findtracks/il/mtb");
  });

  it("ignores a trailing slash", () => {
    expect(parseFindTracksPath("il/mtb/").canonicalPath).toBe("/findtracks/il/mtb");
  });

  it("keeps the valid prefix of a bad URL", () => {
    expect(parseFindTracksPath("il/skateboard")).toMatchObject({
      valid: false,
      facets: { country: "IL" },
      canonicalPath: "/findtracks/il",
    });
    expect(parseFindTracksPath("zz/mtb")).toMatchObject({
      valid: false,
      facets: {},
      canonicalPath: "/findtracks",
    });
  });

  it("rejects a type with no country, and extra segments", () => {
    expect(parseFindTracksPath("mtb").valid).toBe(false);
    const extra = parseFindTracksPath("il/mtb/north");
    expect(extra.valid).toBe(false);
    expect(extra.canonicalPath).toBe("/findtracks/il/mtb");
  });
});

describe("buildFindTracksPath", () => {
  it("round-trips", () => {
    for (const facets of enumerateFindTracksFacets()) {
      expect(parseFindTracksPath(buildFindTracksPath(facets).slice("/findtracks".length))).toEqual({
        facets,
        valid: true,
        canonicalPath: buildFindTracksPath(facets),
      });
    }
  });

  it("drops a type that has no country before it", () => {
    expect(buildFindTracksPath({ type: "mtb" })).toBe("/findtracks");
  });
});

describe("titles", () => {
  it("names the discipline and the country", () => {
    expect(findTracksHeadline({ country: "IL", type: "mtb" })).toBe("MTB tracks in Israel");
    expect(findTracksHeadline({ country: "IL" })).toBe("Tracks in Israel");
    expect(findTracksHeadline({ country: null, type: "road" })).toBe("Road tracks");
    expect(findTracksHeadline({})).toBe("Find Tracks");
    expect(findTracksTitle({ country: "IL", type: "mtb" })).toBe(
      "MTB tracks in Israel · El Niño Ride",
    );
    expect(findTracksDescription({ country: "IL", type: "mtb" })).toContain("MTB tracks in Israel");
  });
});

describe("enumerateFindTracksFacets", () => {
  it("covers every country and type, plus 'any country'", () => {
    const all = enumerateFindTracksFacets();
    expect(all).toContainEqual({});
    expect(all).toContainEqual({ country: "IL", type: "mtb" });
    expect(all).toContainEqual({ country: null, type: "gravel" });
    expect(new Set(all.map(buildFindTracksPath)).size).toBe(all.length);
  });
});
