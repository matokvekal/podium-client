/**
 * The Ride Studio image library: metadata and generation prompts for 20 cycling landscapes.
 *
 * ── Honest status ───────────────────────────────────────────────────────────────────────────
 * No image files exist yet. Generating them needs a paid image service, which was not
 * authorised, and no third-party photograph is substituted. Every entry is therefore
 * `status: "prompt-ready"`: a stable id, the metadata and a complete prompt, waiting for a
 * generation run. Until then the studio suggests covers from the app's existing ride-image
 * registry (see resolver.ts), so the feature works today and upgrades by itself later.
 *
 * ── When the files are generated ────────────────────────────────────────────────────────────
 * 1. Generate each prompt; save as <id>.webp (1600×900, WebP, ≤ 250 KB).
 * 2. Upload through the System Admin ride-images page; the server gives each a registry key.
 * 3. Put that key in `registryKey` below and set `status: "ready"`. Nothing else changes: the
 *    resolver only ever offers an image whose key is live and selectable in the registry, so an
 *    image an admin disables simply stops being suggested, and existing rides keep theirs.
 *
 * Metadata lives here, apart from the files, as required. Every image is AI-generated
 * illustrative artwork (`provenance`), never a verified photograph of a real route, and the UI
 * says so.
 */

import { IMAGE_DIRS } from "../../config/images";
import type { StudioRideType } from "../engine/types";

export type Landscape =
  | "hills"
  | "mountains"
  | "alpine"
  | "forest"
  | "desert"
  | "coast"
  | "farmland"
  | "valley"
  | "mediterranean"
  | "canyon";

export type ImageStatus = "prompt-ready" | "ready";

export interface StudioImage {
  /** Permanent. Never reused for different artwork. */
  id: string;
  /** Ride types this image suits. "any" is the neutral picture used as the last fallback. */
  rideType: StudioRideType | "any";
  /** ISO 3166-1 alpha-2, or null for a country-neutral image. */
  country: string | null;
  /** Israeli region key (lib/regions.ts) when the scene is a specific one, else null. */
  region: string | null;
  continent: "middle-east" | "europe" | "north-america" | "global";
  landscape: readonly Landscape[];
  /** Short description for lists and accessibility text. */
  title: string;
  provenance: "ai-illustration";
  /** Where the image comes from and what licence applies. */
  source: string;
  /** Where the file will be served from once generated. */
  file: string;
  width: number;
  height: number;
  /** Optimised size in bytes once generated; null while there is no file. */
  fileSizeBytes: number | null;
  status: ImageStatus;
  /** The server registry key once uploaded (null until then). */
  registryKey: string | null;
  prompt: string;
}

/** Shared art direction, appended to every prompt so the set reads as one collection. */
export const ART_DIRECTION =
  "Photorealistic editorial landscape photograph, golden-hour or soft morning light, natural " +
  "colour grade, wide 16:9 composition with open sky and room for text overlay in the lower " +
  "third, shallow atmospheric haze, premium magazine quality. No text, no logos, no watermarks, " +
  "no recognisable faces; any rider is a small distant silhouette. Authentic cycling " +
  "atmosphere, no motion blur, no HDR halo.";

function img(
  id: string,
  rideType: StudioImage["rideType"],
  country: string | null,
  region: string | null,
  continent: StudioImage["continent"],
  landscape: readonly Landscape[],
  title: string,
  scene: string,
): StudioImage {
  return {
    id,
    rideType,
    country,
    region,
    continent,
    landscape,
    title,
    provenance: "ai-illustration",
    source: "AI-generated illustration created for El Niño Ride; no third-party material",
    file: `${IMAGE_DIRS.rideStudio}/covers/${id}.webp`,
    width: 1600,
    height: 900,
    fileSizeBytes: null,
    status: "prompt-ready",
    registryKey: null,
    prompt: `${scene} ${ART_DIRECTION}`,
  };
}

export const STUDIO_IMAGES: readonly StudioImage[] = [
  // Road — Israel (3)
  img(
    "rs-road-il-jerusalem-hills",
    "road",
    "IL",
    "jerusalem",
    "middle-east",
    ["hills", "mediterranean"],
    "Road ride in the Jerusalem hills",
    "A winding paved road climbing through the pale limestone Judean hills near Jerusalem, terraced slopes, olive and pine trees, stone-walled terraces, early morning light.",
  ),
  img(
    "rs-road-il-golan",
    "road",
    "IL",
    "golan",
    "middle-east",
    ["hills", "farmland"],
    "Road ride on the Golan Heights",
    "A quiet paved road across the green and gold volcanic plateau of the Golan Heights, basalt boulders in the fields, Mount Hermon with snow patches in the far distance.",
  ),
  img(
    "rs-road-il-sharon",
    "road",
    "IL",
    "sharon",
    "middle-east",
    ["coast", "farmland"],
    "Road ride on the Sharon coastal plain",
    "A flat, straight paved road through the Sharon coastal plain, orange groves and eucalyptus rows on both sides, the Mediterranean glinting faintly on the horizon, warm sunrise.",
  ),

  // MTB — Israel (3)
  img(
    "rs-mtb-il-upper-galilee",
    "mtb",
    "IL",
    "upper_galilee",
    "middle-east",
    ["forest", "hills"],
    "Trail riding in the Upper Galilee",
    "A narrow singletrack winding through oak and terebinth woodland in the Upper Galilee, dappled light, wildflowers along the edge, rocky limestone outcrops.",
  ),
  img(
    "rs-mtb-il-carmel",
    "mtb",
    "IL",
    "carmel",
    "middle-east",
    ["forest", "mediterranean"],
    "Trail riding on Mount Carmel",
    "A fast pine-forest trail on Mount Carmel, red earth, Aleppo pines, sunlight through the canopy, a glimpse of the sea far below through the trees.",
  ),
  img(
    "rs-mtb-il-gilboa",
    "mtb",
    "IL",
    "gilboa_valleys",
    "middle-east",
    ["valley", "hills"],
    "Trail riding in the Gilboa and valleys",
    "A rocky singletrack along a ridge above the Jezreel Valley, spring green slopes dotted with red anemones, patchwork fields below, soft morning mist.",
  ),

  // Gravel — Israel (2)
  img(
    "rs-gravel-il-negev",
    "gravel",
    "IL",
    "negev",
    "middle-east",
    ["desert", "canyon"],
    "Gravel ride in the Negev",
    "A wide compact gravel track crossing the Negev desert, layered sandstone ridges and dry wadis, long shadows, a single acacia tree, vast empty sky.",
  ),
  img(
    "rs-gravel-il-arava",
    "gravel",
    "IL",
    "arava",
    "middle-east",
    ["desert", "valley"],
    "Gravel ride in the Arava",
    "A straight dirt road through the Arava valley at dawn, the red mountains of Edom glowing on the horizon, scattered acacias, pale desert floor.",
  ),

  // Road — Europe (3)
  img(
    "rs-road-ch-alps",
    "road",
    "CH",
    null,
    "europe",
    ["alpine", "mountains"],
    "Road ride in the Swiss Alps",
    "A hairpin alpine road climbing a Swiss mountain pass, green meadows, wooden chalets, snow-capped peaks, a turquoise lake in the valley below.",
  ),
  img(
    "rs-road-fr-countryside",
    "road",
    "FR",
    null,
    "europe",
    ["farmland", "hills"],
    "Road ride in the French countryside",
    "A tree-lined country road rolling through French farmland, golden wheat fields, a stone village and church spire in the distance, soft summer haze.",
  ),
  img(
    "rs-road-es-mallorca",
    "road",
    "ES",
    null,
    "europe",
    ["coast", "mountains"],
    "Road ride on the Mallorca coast",
    "A coastal road cut into limestone cliffs above a deep blue Mediterranean bay, pine trees, hairpins descending to a small harbour, bright clear morning.",
  ),

  // MTB — Europe (3)
  img(
    "rs-mtb-de-forest",
    "mtb",
    "DE",
    null,
    "europe",
    ["forest"],
    "Trail riding in the German forest",
    "A flowing singletrack through a tall beech and spruce forest in Germany, green moss, shafts of light, a few roots across the trail, damp earth after rain.",
  ),
  img(
    "rs-mtb-at-alps",
    "mtb",
    "AT",
    null,
    "europe",
    ["alpine", "mountains"],
    "Trail riding in the Austrian Alps",
    "A grassy alpine singletrack traversing a steep Austrian mountainside, wooden hut below, jagged peaks across the valley, late-afternoon light.",
  ),
  img(
    "rs-mtb-it-dolomites",
    "mtb",
    "IT",
    null,
    "europe",
    ["alpine", "mountains"],
    "Trail riding in the Dolomites",
    "A rocky trail crossing a high meadow beneath the pale pinnacles of the Dolomites, wildflowers, scattered larch trees, warm alpenglow on the rock.",
  ),

  // Gravel — Europe (2)
  img(
    "rs-gravel-it-tuscany",
    "gravel",
    "IT",
    null,
    "europe",
    ["hills", "farmland"],
    "Gravel ride in Tuscany",
    "A white gravel road between rolling Tuscan hills, a line of cypress trees leading to a stone farmhouse, vineyards and olive groves, soft golden light.",
  ),
  img(
    "rs-gravel-hr-dalmatia",
    "gravel",
    "HR",
    null,
    "europe",
    ["coast", "hills"],
    "Gravel ride on the Dalmatian coast",
    "A gravel track along a dry-stone-walled ridge above the Adriatic, islands in the sea below, aromatic scrub and pines, clear blue light.",
  ),

  // Road — North America (1)
  img(
    "rs-road-us-coast",
    "road",
    "US",
    null,
    "north-america",
    ["coast", "hills"],
    "Road ride on the Pacific coast",
    "A smooth coastal highway curving along Pacific cliffs, grassy headlands, crashing surf and sea stacks, cool low sun through a thin marine layer.",
  ),

  // MTB — North America (2)
  img(
    "rs-mtb-us-utah",
    "mtb",
    "US",
    null,
    "north-america",
    ["desert", "canyon"],
    "Desert trail riding in Utah",
    "A slickrock singletrack across red Utah desert sandstone, towering mesas and buttes, a few juniper trees, deep blue sky, strong late light.",
  ),
  img(
    "rs-mtb-ca-bc",
    "mtb",
    "CA",
    null,
    "north-america",
    ["forest", "mountains"],
    "Trail riding in the forests of British Columbia",
    "A fast berm-lined trail through towering Douglas fir and cedar in British Columbia, ferns, mist among the trunks, coastal mountains behind.",
  ),

  // General (1)
  img(
    "rs-any-sunrise",
    "any",
    null,
    null,
    "global",
    ["hills", "valley"],
    "Cycling at sunrise",
    "A calm, universal cycling scene: an empty ribbon of road curving across soft rolling hills at sunrise, long shadows, a pale gradient sky, no recognisable landmark.",
  ),
];

/** The distribution the library is built to (a test keeps the catalogue honest to it). */
export const EXPECTED_DISTRIBUTION: Readonly<Record<string, number>> = {
  "road|middle-east": 3,
  "mtb|middle-east": 3,
  "gravel|middle-east": 2,
  "road|europe": 3,
  "mtb|europe": 3,
  "gravel|europe": 2,
  "road|north-america": 1,
  "mtb|north-america": 2,
  "any|global": 1,
};

/** A Markdown sheet of every prompt, for the generation run. */
export function promptSheet(images: readonly StudioImage[] = STUDIO_IMAGES): string {
  return images
    .map(
      (i) =>
        `## ${i.id}\n- type: ${i.rideType} · country: ${i.country ?? "any"} · region: ${i.region ?? "-"} · ${i.landscape.join(", ")}\n- file: ${i.file} (${i.width}×${i.height}, WebP)\n- prompt: ${i.prompt}\n`,
    )
    .join("\n");
}
