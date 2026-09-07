// Coarse geographic regions for the "Browse tracks" area filter and the create form's area
// dropdown. MIRROR of elnino-server/src/lib/regions.ts — keep the keys, labels and the boxes
// in classifyRegion identical so the form's pre-fill and the server's validation agree.
//
// Israel only for now. A `countries` + `country_regions` model (a region list per country) is
// a later step; until then this constant is the list.
//
// The bounding boxes are DELIBERATELY ROUGH. classifyRegion off the route's start point only
// pre-selects the dropdown — the organiser confirms or corrects it. classifyRegion returns the
// SMALLEST box that contains the point, so a nested region (Eilat in the Arava) wins.

export interface Region {
  key: string;
  /** Hebrew label — what the dropdown shows. */
  he: string;
  /** English label — for logs / non-RTL surfaces. */
  en: string;
  bbox: [number, number, number, number];
}

export const REGION_KEYS = [
  "golan",
  "north",
  "sharon",
  "center",
  "jerusalem",
  "shfela",
  "jordan_valley",
  "dead_sea",
  "negev",
  "arava",
  "eilat",
] as const;

export type RegionKey = (typeof REGION_KEYS)[number];

export const IL_REGIONS: Region[] = [
  { key: "golan", he: "גולן", en: "Golan", bbox: [32.85, 35.6, 33.35, 35.95] },
  { key: "north", he: "צפון", en: "North", bbox: [32.5, 34.9, 33.35, 35.68] },
  { key: "sharon", he: "השרון", en: "Sharon", bbox: [32.05, 34.8, 32.55, 35.05] },
  { key: "center", he: "מרכז", en: "Center", bbox: [31.88, 34.7, 32.1, 35.02] },
  {
    key: "jerusalem",
    he: "ירושלים וההרים",
    en: "Jerusalem & Hills",
    bbox: [31.65, 34.95, 31.92, 35.35],
  },
  { key: "shfela", he: "שפלה", en: "Judean Lowlands", bbox: [31.45, 34.55, 31.95, 34.98] },
  {
    key: "jordan_valley",
    he: "בקעת הירדן",
    en: "Jordan Valley",
    bbox: [31.85, 35.33, 32.9, 35.62],
  },
  { key: "dead_sea", he: "ים המלח", en: "Dead Sea", bbox: [30.85, 35.25, 31.8, 35.55] },
  { key: "negev", he: "נגב", en: "Negev", bbox: [29.9, 34.3, 31.5, 35.3] },
  { key: "arava", he: "ערבה", en: "Arava", bbox: [29.62, 34.88, 30.9, 35.45] },
  { key: "eilat", he: "אילת", en: "Eilat", bbox: [29.5, 34.86, 29.62, 35.02] },
];

const REGION_KEY_SET = new Set<string>(REGION_KEYS);

/** Hebrew label for a stored region key, or the raw key if it is unknown (a future region). */
export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  IL_REGIONS.map((r) => [r.key, r.he]),
);

export function regionLabel(key: string | null | undefined): string {
  if (!key) return "";
  return REGION_LABEL[key] ?? key;
}

export function isRegionKey(value: unknown): value is RegionKey {
  return typeof value === "string" && REGION_KEY_SET.has(value);
}

const bboxArea = ([minLat, minLon, maxLat, maxLon]: Region["bbox"]) =>
  (maxLat - minLat) * (maxLon - minLon);

function contains([minLat, minLon, maxLat, maxLon]: Region["bbox"], lat: number, lon: number) {
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/** The smallest region box that contains the point, or null when it is outside every box. */
export function classifyRegion(
  lat: number | null | undefined,
  lon: number | null | undefined,
): string | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: Region | null = null;
  for (const region of IL_REGIONS) {
    if (!contains(region.bbox, lat, lon)) continue;
    if (best === null || bboxArea(region.bbox) < bboxArea(best.bbox)) best = region;
  }
  return best?.key ?? null;
}
