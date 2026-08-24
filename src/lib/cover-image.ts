/**
 * The per-event cover resizer used by pages/EventCreatePage.tsx.
 *
 * The actual canvas work moved to lib/image-processing.ts when avatars and user covers needed
 * the same crop/scale/compress loop; duplicating it would have let the two drift. This is kept
 * as its own module with its original signature and defaults so that flow is untouched — same
 * JPEG output, same quality steps, same error message.
 *
 * New code should use processIdentityImage() from lib/image-processing.ts instead: it prefers
 * WebP, returns a Blob ready to upload, and handles animated GIFs honestly.
 */

import { resizeToJpegDataUrl } from "./image-processing";

export interface ResizeCoverOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxBytes: number;
  aspectRatio: number | null;
}

const DEFAULT_OPTIONS: ResizeCoverOptions = {
  maxWidth: 1600,
  maxHeight: 900,
  quality: 0.82,
  maxBytes: 450 * 1024,
  aspectRatio: null,
};

export async function resizeCoverFileToDataUrl(
  file: File,
  options: Partial<ResizeCoverOptions> = {},
): Promise<string> {
  return resizeToJpegDataUrl(file, { ...DEFAULT_OPTIONS, ...options });
}
