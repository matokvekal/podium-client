import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderFindTracksHtml } from "./find-tracks-og";

// The real index.html, so this fails the day someone renames or removes one of the tags the
// generator edits — not just when a hand-written sample drifts.
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("renderFindTracksHtml", () => {
  it("writes the link's own title, description and canonical url", () => {
    const html = renderFindTracksHtml(indexHtml, { country: "IL", type: "mtb" });
    expect(html).toContain("<title>MTB tracks in Israel · El Niño Ride</title>");
    expect(html).toMatch(/og:title"\s+content="MTB tracks in Israel · El Niño Ride"/);
    expect(html).toMatch(/og:description"\s+content="Browse MTB tracks in Israel/);
    expect(html).toMatch(/og:url"\s+content="https:\/\/el-nino\.site\/findtracks\/il\/mtb"/);
    expect(html).toMatch(/twitter:title"\s+content="MTB tracks in Israel/);
    expect(html).not.toMatch(/og:title"\s+content="You're invited/);
  });

  it("keeps the app bundle and the image untouched", () => {
    const html = renderFindTracksHtml(indexHtml, { country: null });
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toContain("https://el-nino.site/og-invite.jpg");
    expect(html).toMatch(/og:url"\s+content="https:\/\/el-nino\.site\/findtracks\/all"/);
  });

  it("names the bare page too", () => {
    const html = renderFindTracksHtml(indexHtml, {});
    expect(html).toContain("<title>Find Tracks · El Niño Ride</title>");
    expect(html).toMatch(/og:url"\s+content="https:\/\/el-nino\.site\/findtracks"/);
  });

  it("throws rather than shipping a wrong preview when a tag is missing", () => {
    expect(() => renderFindTracksHtml("<html><head></head></html>", {})).toThrow();
  });
});
