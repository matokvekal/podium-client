/**
 * The pictures on the ride-type cards: the ONE place their paths are listed.
 *
 * The files live in `public/images/ride-studio/types/` — a file is replaced by
 * overwriting it with the same name (960×540 WebP). Nothing in a component names a path, and nothing is embedded in the code: a file is
 * swapped by overwriting it, and a type is added with one line here.
 */

import { IMAGE_DIRS } from "../../config/images";
import type { StudioRideType } from "../engine/types";

export interface TypeImage {
  /** Served from `public/`, so it is copied into the build as-is. */
  src: string;
  /** Behind the picture, and what shows if the file cannot load. */
  gradient: string;
}

const BASE = `${IMAGE_DIRS.rideStudio}/types`;

export const TYPE_IMAGES: Record<StudioRideType, TypeImage> = {
  road: { src: `${BASE}/road.webp`, gradient: "linear-gradient(135deg, #1e3a8a, #f59e0b)" },
  gravel: { src: `${BASE}/gravel.webp`, gradient: "linear-gradient(135deg, #0ea5e9, #a47b4c)" },
  mtb: { src: `${BASE}/mtb.webp`, gradient: "linear-gradient(135deg, #312e81, #16a34a)" },
};
