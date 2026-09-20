// Turns the built index.html into the page for ONE Find Tracks link, with that link's own preview
// tags. Pure string work, no React and no DOM: vite-plugin-findtracks-og.ts calls it at build time
// (in Node) once per link, and the test calls it directly.
//
// WHY THIS EXISTS. A link preview (Facebook, WhatsApp, iMessage...) is drawn from the head of the
// HTML the link returns, fetched by a crawler that does not run JavaScript. The app is a
// single-page app, so every URL used to return the same index.html — "You're invited to ride" —
// even for a tracks link. Writing a static copy per link, with its own title and description, is
// the smallest fix that needs no server code: the copy still loads the same bundle, so a person
// who opens it gets the normal app.
//
// The head is edited by tag, not by rewriting it, so anything added to index.html later is kept.
// If a tag this expects is missing the function throws — a silent no-op would ship a preview
// that says "You're invited" for every tracks link and nobody would notice until it was shared.

import {
  buildFindTracksPath,
  type FindTracksFacets,
  findTracksDescription,
  findTracksTitle,
} from "./find-tracks-url";

/** Where the site lives — og:url must be absolute. The image tags in index.html already are. */
export const SITE_ORIGIN = "https://el-nino.site";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Replace the content="" of the meta tag with this property/name; throws if there is none. */
function setMeta(html: string, attr: "property" | "name", key: string, value: string): string {
  const tag = new RegExp(String.raw`(<meta\s+${attr}="${key}"\s+content=")[^"]*(")`);
  if (!tag.test(html)) throw new Error(`index.html has no <meta ${attr}="${key}">`);
  return html.replace(
    tag,
    (_m, open: string, close: string) => `${open}${escapeAttr(value)}${close}`,
  );
}

export function renderFindTracksHtml(indexHtml: string, facets: FindTracksFacets): string {
  const title = findTracksTitle(facets);
  const description = findTracksDescription(facets);
  const url = `${SITE_ORIGIN}${buildFindTracksPath(facets)}`;

  let html = indexHtml;
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error("index.html has no <title>");
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeAttr(title)}</title>`);
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  return html;
}
