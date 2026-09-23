// Build step: after the app is built, write a copy of index.html for every Find Tracks link —
// dist/findtracks/index.html, dist/findtracks/il/index.html, dist/findtracks/il/mtb/index.html —
// each with its own link-preview tags (src/lib/find-tracks-og.ts).
//
// The server already serves a directory's index.html for /findtracks/il/mtb (nginx try_files
// $uri $uri/ /index.html), so nothing but the files is needed for Facebook to see "MTB tracks in
// Israel" instead of the site-wide "You're invited to ride". Every copy loads the same bundle from
// absolute /assets/ paths, so a person opening one gets the normal app.
//
// ~250 files of ~3 KB. Which links exist is decided in ONE place, enumerateFindTracksFacets().

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { renderFindTracksHtml } from "./src/lib/find-tracks-og";
import { buildFindTracksPath, enumerateFindTracksFacets } from "./src/lib/find-tracks-url";

export function findTracksOgPlugin(): Plugin {
  let outDir = "";
  let isBuild = false;

  return {
    name: "findtracks-og",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      isBuild = config.command === "build" && !config.build.ssr;
    },
    closeBundle() {
      if (!isBuild) return;
      const indexHtml = readFileSync(join(outDir, "index.html"), "utf8");
      const facetsList = enumerateFindTracksFacets();
      for (const facets of facetsList) {
        const file = join(outDir, buildFindTracksPath(facets), "index.html");
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, renderFindTracksHtml(indexHtml, facets));
      }
      console.log(`findtracks-og: wrote ${facetsList.length} link-preview pages`);
    },
  };
}
