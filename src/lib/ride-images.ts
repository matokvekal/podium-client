/**
 * The built-in RIDE cover-image registry — what an organizer may pick on Create/Edit Ride and
 * what events.rideImageKey (sql/051-events-ride-image.sql) may name.
 *
 * V1 is picker-only, by design: these are shared APPLICATION assets in public/ride-images/, not
 * a per-ride upload. Choosing one stores only its `key`, on the server, in events.ride_image_key
 * — never a copy of the image, never a URL, never binary data. See the "no upload" plan.
 *
 * ── This list mirrors the server's registry ────────────────────────────────────────────────
 *
 * The same keys exist in elnino-server/src/config/ride-images.ts, which is what actually
 * enforces the allow-list (z.enum(RIDE_IMAGE_KEYS) on create/update) — this file is the client's
 * own copy so the picker and the resolver never have to ask the server what is valid.
 *
 * ── The two rules that make this safe to grow ──────────────────────────────────────────────
 *
 * 1. A KEY IS PERMANENT. Never rename one, never reuse a retired one, and never repoint an
 *    existing key at different artwork — an existing ride's stored value is that string. To
 *    replace a picture, add a new key and leave the old file in place.
 *
 * 2. RETIRE BY FLAG, NOT BY DELETION. Set `selectable: false` to drop an image from the picker
 *    grid while keeping the key valid — an existing ride wearing it must keep rendering, and the
 *    server schema would reject that ride's next unrelated edit if the key vanished from either
 *    registry (see identity-presets.ts's identical rule for user avatar/cover presets).
 *
 * Adding an image later is therefore: drop the .webp in public/ride-images/ named exactly after
 * its key, add one entry here AND one matching key in the server's RIDE_IMAGE_KEYS. Nothing else
 * — no migration, no DB row.
 */

export type RideImageCategory = "sukkot" | "holidays" | "road" | "mtb" | "gravel" | "generic";

export const CATEGORY_LABEL: Record<RideImageCategory, string> = {
  sukkot: "Sukkot",
  holidays: "Holidays",
  road: "Road",
  mtb: "MTB",
  gravel: "Gravel",
  generic: "General",
};

/** Display order for the (currently flat, V1) picker grid. Presentation only. */
export const CATEGORY_ORDER: readonly RideImageCategory[] = [
  "sukkot",
  "holidays",
  "road",
  "mtb",
  "gravel",
  "generic",
];

export interface RideImage {
  /** STABLE and permanent — the only thing ever persisted (server: events.ride_image_key). */
  key: string;
  /** Public path. Always `/ride-images/<key>.webp`, so a registry entry and its file cannot
   *  drift apart. */
  src: string;
  category: RideImageCategory;
  /** Shown under the thumbnail in the picker. */
  label: string;
  /** false = hidden from the picker grid, key stays valid for rides that already wear it. See
   *  rule 2 above. Omitted = true. */
  selectable?: boolean;
}

function rideImage(
  key: string,
  category: RideImageCategory,
  label: string,
  selectable = true,
): RideImage {
  return { key, src: `/ride-images/${key}.webp`, category, label, selectable };
}

/** Append new entries at the end. Never edit, reorder or remove an existing one — see rule 1
 *  above. Keep in step with elnino-server/src/config/ride-images.ts's RIDE_IMAGE_KEYS. */
export const RIDE_IMAGES: readonly RideImage[] = [
  rideImage("sukkot-01", "sukkot", "Sukkot"),
  rideImage("sukkot-02", "sukkot", "Sukkot"),
  rideImage("sukkot-03", "sukkot", "Sukkot"),
];

const BY_KEY = new Map(RIDE_IMAGES.map((img) => [img.key, img]));

/**
 * Unknown/null/undefined key → null, deliberately, and never a throw. This is what keeps an
 * event with a retired or not-yet-recognized key (an older client, a newer server) from
 * rendering a broken image: the caller falls through to the next rung of the cover chain
 * (event-visuals.ts) instead.
 */
export function getRideImage(key: string | null | undefined): RideImage | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** The images the picker grid actually offers — excludes anything flagged `selectable: false`. */
export function selectableRideImages(): RideImage[] {
  return RIDE_IMAGES.filter((img) => img.selectable !== false);
}

/** Grouped for a future categorized picker, in CATEGORY_ORDER, skipping empty categories. V1's
 *  picker renders a flat grid instead (few enough images that grouping isn't needed yet) — this
 *  is here so growing the registry doesn't require redesigning the picker later. */
export function rideImagesByCategory(): {
  category: RideImageCategory;
  label: string;
  images: RideImage[];
}[] {
  const all = selectableRideImages();
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    images: all.filter((img) => img.category === category),
  })).filter((group) => group.images.length > 0);
}
