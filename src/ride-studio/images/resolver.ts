/**
 * Picks cover images for a ride. Pure and synchronous: it works from the catalogue already in
 * memory (the live ride-image registry, fetched once per session) and never waits on a network
 * or a generation step, so choosing a ride type never blocks or slows the conversation.
 *
 * The fallback ladder, most specific first:
 *   1. exact region + ride type
 *   2. similar landscape + ride type
 *   3. country + ride type
 *   4. any country, same ride type
 *   5. the neutral cycling image
 *   6. (last resort) whatever the registry offers, so there is almost always something
 *
 * A Studio library image is offered only when it is READY (uploaded, with a registry key) AND
 * that key is live and selectable in the registry right now — so an image an administrator
 * disables stops being suggested, and nothing offered can fail the server's key allow-list.
 * Until the 20-image set is generated, rungs 1–5 find nothing and the ladder lands on the
 * existing registry covers of the ride's type: the studio works today and improves by itself.
 */

import { resolveApiAssetUrl } from "../../lib/ride-images-dynamic";
import type { RideImageDto } from "../../store/rideImagesStore";
import type { StudioRideType } from "../engine/types";
import { type Landscape, STUDIO_IMAGES, type StudioImage } from "./catalog";

export type Tier = "region" | "landscape" | "country" | "type" | "neutral" | "registry";

export interface CoverSuggestion {
  /** The registry key — the only thing stored on the ride (events.ride_image_key). */
  key: string;
  url: string;
  label: string;
  tier: Tier;
  /** Library image id when it came from the Studio set, else null. */
  imageId: string | null;
  /** Studio library images are AI illustrations; registry covers are the app's own artwork. */
  illustrative: boolean;
}

export interface CoverQuery {
  rideType: StudioRideType | null;
  country: string | null;
  region: string | null;
  /** Optional extra hints; otherwise derived from the region. */
  landscape?: readonly Landscape[];
}

/** What an Israeli region looks like, so "similar landscape" works without the organizer
 *  having to describe it. Other countries rely on the country / type rungs. */
const REGION_LANDSCAPE: Readonly<Record<string, readonly Landscape[]>> = {
  golan: ["hills", "farmland"],
  north: ["hills", "forest"],
  upper_galilee: ["forest", "hills"],
  lower_galilee: ["hills", "farmland"],
  western_galilee: ["hills", "coast"],
  carmel: ["forest", "mediterranean"],
  gilboa_valleys: ["valley", "hills"],
  sharon: ["coast", "farmland"],
  center: ["farmland", "coast"],
  jerusalem: ["hills", "mediterranean"],
  shfela: ["hills", "farmland"],
  south_hebron: ["hills", "desert"],
  jordan_valley: ["valley", "desert"],
  dead_sea: ["desert", "canyon"],
  negev: ["desert", "canyon"],
  arava: ["desert", "valley"],
  eilat: ["desert", "coast"],
};

function liveKeys(catalog: readonly RideImageDto[] | null): Map<string, RideImageDto> {
  const map = new Map<string, RideImageDto>();
  for (const dto of catalog ?? []) if (dto.selectable) map.set(dto.key, dto);
  return map;
}

function fromStudio(image: StudioImage, dto: RideImageDto, tier: Tier): CoverSuggestion {
  return {
    key: dto.key,
    url: resolveApiAssetUrl(dto.url),
    label: image.title,
    tier,
    imageId: image.id,
    illustrative: true,
  };
}

function fromRegistry(dto: RideImageDto, tier: Tier): CoverSuggestion {
  return {
    key: dto.key,
    url: resolveApiAssetUrl(dto.url),
    label: dto.label,
    tier,
    imageId: null,
    illustrative: false,
  };
}

/**
 * Ordered suggestions, best first, no duplicates, at most `limit`. The first is what the studio
 * pre-selects; the rest are the "Change image" alternatives.
 */
export function suggestCovers(
  query: CoverQuery,
  catalog: readonly RideImageDto[] | null,
  limit = 4,
  library: readonly StudioImage[] = STUDIO_IMAGES,
): CoverSuggestion[] {
  const live = liveKeys(catalog);
  const out: CoverSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: CoverSuggestion) => {
    if (!seen.has(s.key)) {
      seen.add(s.key);
      out.push(s);
    }
  };

  const ready = library.filter(
    (i) => i.status === "ready" && i.registryKey && live.has(i.registryKey),
  );
  const use = (image: StudioImage, tier: Tier) => {
    const dto = image.registryKey ? live.get(image.registryKey) : undefined;
    if (dto) push(fromStudio(image, dto, tier));
  };

  const type = query.rideType;
  const wanted = query.landscape ?? (query.region ? (REGION_LANDSCAPE[query.region] ?? []) : []);

  if (type) {
    // 1. exact region + type
    if (query.region)
      for (const i of ready) if (i.rideType === type && i.region === query.region) use(i, "region");
    // 2. similar landscape + type (same continent family first via the country match below)
    if (wanted.length > 0) {
      const scored = ready
        .filter((i) => i.rideType === type && i.landscape.some((l) => wanted.includes(l)))
        .sort((a, b) => overlap(b, wanted) - overlap(a, wanted));
      for (const i of scored) use(i, "landscape");
    }
    // 3. country + type
    if (query.country)
      for (const i of ready)
        if (i.rideType === type && i.country === query.country) use(i, "country");
    // 4. same type anywhere
    for (const i of ready) if (i.rideType === type) use(i, "type");
  }
  // 5. the neutral image
  for (const i of ready) if (i.rideType === "any") use(i, "neutral");

  // 6. the registry's own covers for this ride type, then anything selectable. This is the rung
  //    that carries the studio until the library files exist.
  const category = type === "road" || type === "mtb" || type === "gravel" ? type : "generic";
  for (const dto of live.values())
    if (dto.category === category) push(fromRegistry(dto, "registry"));
  for (const dto of live.values())
    if (dto.category === "generic") push(fromRegistry(dto, "registry"));
  for (const dto of live.values()) push(fromRegistry(dto, "registry"));

  return out.slice(0, limit);
}

function overlap(image: StudioImage, wanted: readonly Landscape[]): number {
  return image.landscape.filter((l) => wanted.includes(l)).length;
}

/** The single pre-selected suggestion, or null when the registry has not loaded / is empty. */
export function suggestCover(
  query: CoverQuery,
  catalog: readonly RideImageDto[] | null,
): CoverSuggestion | null {
  return suggestCovers(query, catalog, 1)[0] ?? null;
}
