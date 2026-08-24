/**
 * The built-in visual preset library.
 *
 * These are shared APPLICATION assets in public/identity-presets/, not per-user files. A user
 * who picks one stores only its `id`; the server/DB will eventually store that same string and
 * nothing else — never a copy of the image, never a URL.
 *
 * ── The two rules that make this safe to grow ──────────────────────────────────────────────
 *
 * 1. AN ID IS PERMANENT. Never rename one, never reuse a retired one, and never repoint an
 *    existing id at different artwork. Somebody's saved identity is that string. To replace a
 *    picture, add a new id and leave the old file in place.
 *
 * 2. THE DEFAULT POOLS ARE APPEND-ONLY, and the deterministic default is chosen from a pool
 *    rather than from IDENTITY_PRESETS. That is the whole reason the pools exist: adding fifty
 *    presets to the registry below must not change what a single existing user already sees.
 *    Appending to a pool only affects users whose hash lands on a newly added slot; inserting
 *    or reordering would reshuffle everyone, so don't.
 *
 * Adding a preset later is therefore: drop the SVG in public/identity-presets/{covers,avatars}/
 * named exactly after its id, add one entry here. Nothing else.
 *
 * Assets are SVG so one file serves every render size (see aspectRatio note below), and because
 * public/service-worker.js already caches same-origin .svg cache-first — the whole library is
 * offline-ready with no extra work.
 */

import { pickStable } from "./stable-hash";

export type IdentityAssetType = "avatar" | "cover";

export type PresetCategory =
  | "road"
  | "mtb"
  | "gravel"
  | "running"
  | "mountain"
  | "forest"
  | "ocean"
  | "sky"
  | "sunset"
  | "night"
  | "stars"
  | "abstract";

/**
 * Standard asset dimensions. Recorded per-preset rather than assumed, and mirrored by the
 * upload targets in lib/image-processing.ts so a chosen preset and an uploaded photo fill the
 * same box.
 *
 * Rendering must NOT depend on these numbers: use a fixed aspect-ratio container plus
 * `object-fit: cover` (or `background-size: cover`), so one 256px avatar file is correct at
 * 16px in a card and 96px on the account page, and one cover adapts from phone to desktop.
 * They are here for the picker's layout, for validation, and for the future server contract.
 */
export const AVATAR_DIMENSIONS = { width: 256, height: 256, aspectRatio: "1:1" } as const;
export const COVER_DIMENSIONS = { width: 1200, height: 450, aspectRatio: "8:3" } as const;

export interface IdentityPreset {
  /** STABLE and permanent — the only thing ever persisted. See rule 1 above. */
  id: string;
  type: IdentityAssetType;
  /** Public path. Always `<dir>/<id>.svg`, so a registry entry and its file cannot drift. */
  url: string;
  width: number;
  height: number;
  aspectRatio: "1:1" | "8:3";
  category: PresetCategory;
  /** Shown under the thumbnail in the picker. */
  label: string;
}

export const CATEGORY_LABEL: Record<PresetCategory, string> = {
  road: "Road",
  mtb: "MTB",
  gravel: "Gravel",
  running: "Running",
  mountain: "Mountains",
  forest: "Forest",
  ocean: "Ocean",
  sky: "Sky",
  sunset: "Sunset",
  night: "Night",
  stars: "Stars",
  abstract: "Abstract",
};

/** Display order for the grouped picker. Presentation only — never affects resolution. */
export const CATEGORY_ORDER: readonly PresetCategory[] = [
  "road",
  "mtb",
  "gravel",
  "running",
  "mountain",
  "forest",
  "ocean",
  "sky",
  "sunset",
  "night",
  "stars",
  "abstract",
];

function cover(id: string, category: PresetCategory, label: string): IdentityPreset {
  return {
    id,
    type: "cover",
    url: `/identity-presets/covers/${id}.svg`,
    ...COVER_DIMENSIONS,
    category,
    label,
  };
}

function avatar(id: string, category: PresetCategory, label: string): IdentityPreset {
  return {
    id,
    type: "avatar",
    url: `/identity-presets/avatars/${id}.svg`,
    ...AVATAR_DIMENSIONS,
    category,
    label,
  };
}

/** Append new entries at the end. Never edit or remove an existing one — see rule 1. */
export const IDENTITY_PRESETS: readonly IdentityPreset[] = [
  // --- covers, 1200x450 ---
  cover("cover-road-01", "road", "Open road at dusk"),
  cover("cover-road-02", "road", "Road through the hills"),
  cover("cover-mtb-01", "mtb", "Trail contours"),
  cover("cover-mtb-02", "mtb", "Jagged trail ridge"),
  cover("cover-gravel-01", "gravel", "Gravel track"),
  cover("cover-running-01", "running", "Running track at sunrise"),
  cover("cover-mountain-01", "mountain", "Mountain ridge"),
  cover("cover-mountain-02", "mountain", "Dusk over the peaks"),
  cover("cover-forest-01", "forest", "Deep forest"),
  cover("cover-forest-02", "forest", "Summer woodland"),
  cover("cover-ocean-01", "ocean", "Coastal water"),
  cover("cover-ocean-02", "ocean", "Deep ocean"),
  cover("cover-sky-01", "sky", "Wide blue sky"),
  cover("cover-sunset-01", "sunset", "Golden sunset"),
  cover("cover-sunset-02", "sunset", "Violet sunset"),
  cover("cover-sunset-03", "sunset", "Warm evening light"),
  cover("cover-night-01", "night", "Night ride"),
  cover("cover-stars-01", "stars", "Star field"),
  cover("cover-abstract-01", "abstract", "Crimson"),
  cover("cover-abstract-02", "abstract", "Blue"),

  // --- avatars, 256x256 ---
  avatar("avatar-mtb-01", "mtb", "Knobbly tyre"),
  avatar("avatar-road-01", "road", "Road wheel"),
  avatar("avatar-gravel-01", "gravel", "Gravel chevrons"),
  avatar("avatar-running-01", "running", "Stride"),
  avatar("avatar-mountain-01", "mountain", "Peaks"),
  avatar("avatar-forest-01", "forest", "Conifers"),
  avatar("avatar-ocean-01", "ocean", "Swell"),
  avatar("avatar-sky-01", "sky", "Sun and clouds"),
  avatar("avatar-sunset-01", "sunset", "Sunset horizon"),
  avatar("avatar-night-01", "night", "Crescent moon"),
  avatar("avatar-stars-01", "stars", "Bright star"),
  avatar("avatar-abstract-01", "abstract", "Arcs"),
  avatar("avatar-abstract-02", "abstract", "Bands"),
  avatar("avatar-abstract-03", "abstract", "Orbs"),
];

const BY_ID = new Map(IDENTITY_PRESETS.map((p) => [p.id, p]));

/**
 * Unknown id → null, deliberately, and never a throw. This is what keeps an OLD client working
 * against a NEWER server: if the server hands back a preset id added after this build shipped,
 * the caller falls through to the next rung of its fallback chain instead of rendering a broken
 * image. Same for a corrupted localStorage value.
 */
export function getPreset(id: string | null | undefined): IdentityPreset | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Type-checked lookup — a cover id asked for as an avatar is a miss, not a wrong-shaped hit. */
export function getPresetOfType(
  id: string | null | undefined,
  type: IdentityAssetType,
): IdentityPreset | null {
  const preset = getPreset(id);
  return preset && preset.type === type ? preset : null;
}

export function presetsOfType(type: IdentityAssetType): IdentityPreset[] {
  return IDENTITY_PRESETS.filter((p) => p.type === type);
}

/** Grouped for the picker, in CATEGORY_ORDER, skipping categories with nothing in them. */
export function presetsByCategory(
  type: IdentityAssetType,
): { category: PresetCategory; label: string; presets: IdentityPreset[] }[] {
  const all = presetsOfType(type);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    presets: all.filter((p) => p.category === category),
  })).filter((group) => group.presets.length > 0);
}

/**
 * APPEND-ONLY. See rule 2 in the file header — this is the load-bearing detail of the whole
 * registry. A user who never picked anything gets `pickStable(pool, theirId)`, so the pool's
 * ORDER and LENGTH are part of what they see. Adding to the end is safe; inserting, reordering
 * or removing re-rolls the default for a share of existing users.
 *
 * Deliberately a curated spread rather than every cover: these are the ones that read well
 * behind overlaid white text at every size.
 */
export const DEFAULT_COVER_POOL: readonly string[] = [
  "cover-mountain-01",
  "cover-sunset-01",
  "cover-forest-01",
  "cover-ocean-01",
  "cover-road-01",
  "cover-night-01",
  "cover-sky-01",
  "cover-sunset-02",
  "cover-mtb-02",
  "cover-ocean-02",
  "cover-gravel-01",
  "cover-abstract-02",
];

/**
 * APPEND-ONLY, same rules. Currently unused: an avatar with no explicit choice keeps the
 * existing initial-on-a-hashed-colour placeholder, which is already deterministic and carries
 * more information than a generic picture would. See AVATAR_DEFAULT_PRESET_ENABLED in
 * lib/user-identity.ts — this pool is what that flag would switch on.
 */
export const DEFAULT_AVATAR_POOL: readonly string[] = [
  "avatar-abstract-01",
  "avatar-mountain-01",
  "avatar-ocean-01",
  "avatar-forest-01",
  "avatar-abstract-03",
  "avatar-night-01",
  "avatar-sunset-01",
  "avatar-abstract-02",
];

/**
 * The deterministic default for a user who has chosen nothing. Stable for a given seed: the
 * same organizer wears the same cover on every one of their events, on every device, forever.
 *
 * `seed` should be the user's id — something that does not change. A display name would move
 * the picture every time they edited their profile.
 */
export function defaultPresetFor(
  type: IdentityAssetType,
  seed: string | null | undefined,
): IdentityPreset | null {
  const pool = type === "cover" ? DEFAULT_COVER_POOL : DEFAULT_AVATAR_POOL;
  return getPresetOfType(pickStable(pool, seed), type);
}
