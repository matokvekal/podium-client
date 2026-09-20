// The shareable URL of Find Tracks: /findtracks[/<country>[/<type>]], e.g. /findtracks/il/mtb.
//
// ONE MODULE, THREE READERS. The page (TracksPage) parses it to know what to show and builds it
// when the rider changes a filter; the share button builds the canonical link; and the build-time
// preview generator (vite-plugin-findtracks-og.ts) walks every valid path to write a static
// HTML file per link, so Facebook's crawler — which never runs JavaScript — gets a card that
// names the country and discipline. They all go through here so the URL, the page title and the
// preview text can never drift apart.
//
// SEGMENTS ARE POSITIONAL AND ORDERED (FACETS below). country comes first, type second. A later
// facet can only appear if every earlier one does — "/findtracks/mtb" is not a thing — which is
// what keeps the URL space small enough to pre-render. Country may be "all" ("any country") so a
// type can still be named without picking a country.
//
// ADDING A FACET LATER (state / area such as "north"): append one FacetDef to FACETS, add its
// value to FindTracksFacets, and the parser, builder, title and preview enumeration follow. The
// route in App.tsx is a splat and needs no change.
//
// This file must stay free of React and of anything that pulls in an icon library: the build
// plugin imports it from vite.config.ts, in plain Node.

import { COUNTRIES } from "./countries";
import type { SurfaceType } from "./surface-types";

/** The URL word for "any country". */
export const ANY_COUNTRY_SEGMENT = "all";

export const FIND_TRACKS_BASE = "/findtracks";

/** URL word -> label. Typed on SurfaceType so adding a discipline there is a compile error here
 *  until it is given a label (lib/surface-types.ts pulls in lucide-react, hence the copy). */
const TYPE_LABEL: Record<SurfaceType, string> = {
  road: "Road",
  gravel: "Gravel",
  mtb: "MTB",
  running: "Running",
  hiking: "Hiking",
};

export const FIND_TRACKS_TYPES = Object.keys(TYPE_LABEL) as SurfaceType[];

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export interface FindTracksFacets {
  /** ISO code upper-case ("IL"); null = any country ("all"); undefined = not in the URL. */
  country?: string | null;
  /** undefined = not in the URL. */
  type?: SurfaceType;
}

interface FacetDef<K extends keyof FindTracksFacets> {
  key: K;
  /** The value for a URL segment, or `invalid` when the segment is not one. */
  parse(segment: string): FindTracksFacets[K] | typeof invalid;
  format(value: NonNullable<FindTracksFacets[K]> | null): string;
}

const invalid = Symbol("invalid");

const countryFacet: FacetDef<"country"> = {
  key: "country",
  parse(segment) {
    if (segment === ANY_COUNTRY_SEGMENT) return null;
    const code = segment.toUpperCase();
    return COUNTRY_NAME.has(code) ? code : invalid;
  },
  format: (value) => (value === null ? ANY_COUNTRY_SEGMENT : value.toLowerCase()),
};

const typeFacet: FacetDef<"type"> = {
  key: "type",
  parse(segment) {
    const type = segment.toLowerCase();
    return type in TYPE_LABEL ? (type as SurfaceType) : invalid;
  },
  format: (value) => value as string,
};

/** In URL order. Append here to add a segment. */
const FACETS = [countryFacet, typeFacet] as const;

export interface FindTracksParse {
  /** The facets the URL names — only the valid prefix when `valid` is false. */
  facets: FindTracksFacets;
  /** False when the URL had a segment we do not know, or more segments than exist. */
  valid: boolean;
  /** The lowercase path for `facets`. The page redirects here when it differs from the URL. */
  canonicalPath: string;
}

/** Parse the splat after /findtracks ("il/mtb"; undefined or "" for the bare page). */
export function parseFindTracksPath(splat: string | undefined): FindTracksParse {
  const segments = (splat ?? "").split("/").filter(Boolean);
  const facets: FindTracksFacets = {};
  let valid = segments.length <= FACETS.length;

  for (let i = 0; i < Math.min(segments.length, FACETS.length); i++) {
    const facet = FACETS[i];
    const value = facet.parse(segments[i]);
    if (value === invalid) {
      valid = false;
      break;
    }
    (facets as Record<string, unknown>)[facet.key] = value;
  }
  return { facets, valid, canonicalPath: buildFindTracksPath(facets) };
}

/**
 * "/findtracks/il/mtb". Stops at the first unset facet, so a type without a country is dropped
 * (the caller passes country: null for "any country", which is written as "all").
 */
export function buildFindTracksPath(facets: FindTracksFacets): string {
  const parts: string[] = [];
  for (const facet of FACETS) {
    const value = facets[facet.key];
    if (value === undefined) break;
    parts.push(facet.format(value as never));
  }
  return parts.length ? `${FIND_TRACKS_BASE}/${parts.join("/")}` : FIND_TRACKS_BASE;
}

/** "MTB tracks in Israel", "Tracks in Israel", "MTB tracks", "Find Tracks". */
export function findTracksHeadline(facets: FindTracksFacets): string {
  const type = facets.type ? TYPE_LABEL[facets.type] : null;
  const country = facets.country ? (COUNTRY_NAME.get(facets.country) ?? null) : null;
  if (!type && !country) return "Find Tracks";
  const noun = type ? `${type} tracks` : "Tracks";
  return country ? `${noun} in ${country}` : noun;
}

/** The page title and the preview card's title. */
export function findTracksTitle(facets: FindTracksFacets): string {
  return `${findTracksHeadline(facets)} · El Niño Ride`;
}

export function findTracksDescription(facets: FindTracksFacets): string {
  const type = facets.type ? `${TYPE_LABEL[facets.type]} ` : "";
  const country = facets.country ? (COUNTRY_NAME.get(facets.country) ?? null) : null;
  const where = country ? ` in ${country}` : "";
  return `Browse ${type}tracks${where} ridden by the El Niño Ride community — see the map, distance and climb of each one. No sign-up needed.`;
}

/**
 * Every valid link, shortest first: the bare page, each country, each country + type. The
 * preview generator writes one static file for each. Also the place to extend when a facet is
 * added (e.g. Israel's regions).
 */
export function enumerateFindTracksFacets(): FindTracksFacets[] {
  const all: FindTracksFacets[] = [{}];
  // null is "any country" ("all" in the URL) — it can carry a type just like a real country.
  for (const country of [null, ...COUNTRIES.map((c) => c.code)]) {
    all.push({ country });
    for (const type of FIND_TRACKS_TYPES) all.push({ country, type });
  }
  return all;
}

/**
 * What the URL can say about the page's current filters. `type` appears only when exactly one
 * discipline is selected — a two-discipline view has no single word for it, so its URL names the
 * country alone and the extra disciplines simply are not shareable.
 */
export function facetsFromCriteria(criteria: {
  country: string | null;
  surface: SurfaceType[];
}): FindTracksFacets {
  return {
    country: criteria.country,
    type: criteria.surface.length === 1 ? criteria.surface[0] : undefined,
  };
}

/** True when two facet sets name the same URL. */
export function sameFacets(a: FindTracksFacets, b: FindTracksFacets): boolean {
  return buildFindTracksPath(a) === buildFindTracksPath(b);
}
