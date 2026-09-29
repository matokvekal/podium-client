// The dynamic ride-cover catalog: same job as lib/ride-images.ts's getRideImage /
// selectableRideImages, but sourced from store/rideImagesStore.ts (GET /api/v1/ride-images)
// instead of the compiled RIDE_IMAGES array, so a System Admin's upload — or disable — shows up
// immediately, with no rebuild and no redeploy.
//
// lib/ride-images.ts is left exactly as it was. Its RIDE_IMAGES array is used here only as the
// FALLBACK for a component whose render runs before the store's first fetch resolves (or if
// that fetch ever fails) — see resolveRideImage/selectableFrom below, both plain functions of
// "whatever the store currently holds" so they need no React context of their own and are easy
// to unit test.
//
// useRideImages() is the one piece that DOES touch React: it subscribes to the store so a
// component using it re-renders the moment the fetch resolves, and kicks off that fetch itself
// (ensureLoaded is idempotent) so no call site has to remember to.

import { useEffect } from "react";
import { config } from "./config";
import { type RideImageDto, useRideImagesStore } from "../store/rideImagesStore";
import {
  getRideImage as getStaticRideImage,
  type RideImage,
  type RideImageCategory,
  selectableRideImages as staticSelectableRideImages,
} from "./ride-images";

/**
 * The server returns an uploaded cover as a path on the API origin ("/api/v1/ride-image-files/…").
 * When the app is served from the same origin as the API (production: VITE_API_URL=/api/v1) that
 * path works as is; when the API is on another origin (local dev) it needs that origin in front.
 * Built-in covers ("/ride-images/…") and full URLs are left alone.
 */
export function resolveApiAssetUrl(url: string, apiUrl: string = config.apiUrl): string {
  if (!url.startsWith("/api/") || !/^https?:\/\//i.test(apiUrl)) return url;
  return new URL(url, apiUrl).href;
}

function toRideImage(dto: RideImageDto): RideImage {
  return {
    key: dto.key,
    src: resolveApiAssetUrl(dto.url),
    category: (dto.category as RideImageCategory) ?? "generic",
    label: dto.label,
    selectable: dto.selectable,
  };
}

/** Resolves ANY known key regardless of `selectable` — needed to render a ride's existing
 *  cover, which must keep showing even after an admin retires that key from the picker.
 *  `catalog` is whatever useRideImagesStore's `images` currently holds; null (not yet fetched,
 *  or the fetch failed) falls back to the compiled static list. */
export function resolveRideImage(
  catalog: readonly RideImageDto[] | null,
  key: string | null | undefined,
): RideImage | null {
  if (!key) return null;
  if (catalog === null) return getStaticRideImage(key);
  const found = catalog.find((img) => img.key === key);
  return found ? toRideImage(found) : null;
}

/**
 * True while an event's cover is genuinely unknown: it names a ride image, the catalog has not
 * arrived (and has not failed), and the compiled list cannot answer either — an admin-uploaded
 * key is never in the compiled list. Callers must render a neutral placeholder then, not the
 * default cover, or the default flashes before the real picture replaces it.
 */
export function isRideImagePending(
  catalog: readonly RideImageDto[] | null,
  key: string | null | undefined,
  failed: boolean,
): boolean {
  if (!key || catalog !== null || failed) return false;
  return getStaticRideImage(key) === null;
}

/** What the Create/Edit Ride picker grid offers. */
export function selectableFrom(catalog: readonly RideImageDto[] | null): RideImage[] {
  if (catalog === null) return staticSelectableRideImages();
  return catalog.filter((img) => img.selectable).map(toRideImage);
}

/**
 * Subscribes to the live catalog and ensures it has been requested at least once. Call from any
 * component body that needs to resolve a key to a picture or render the picker grid.
 */
export function useRideImages(): readonly RideImageDto[] | null {
  const images = useRideImagesStore((s) => s.images);
  useEffect(() => {
    void useRideImagesStore.getState().ensureLoaded();
  }, []);
  return images;
}

/** True while this ride's cover is still being resolved — see isRideImagePending. */
export function useRideImagePending(key: string | null | undefined): boolean {
  const images = useRideImagesStore((s) => s.images);
  const failed = useRideImagesStore((s) => s.error !== null);
  return isRideImagePending(images, key, failed);
}
