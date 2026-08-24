/**
 * Client-side image preparation for avatars and covers.
 *
 * ── THESE LIMITS ARE NOT SECURITY ──────────────────────────────────────────────────────────
 *
 * Everything here is UX and bandwidth: it stops a rider waiting on a 12 MB phone photo and
 * keeps what we hold small. It proves NOTHING about the bytes that eventually reach a server.
 * Anyone can skip this code entirely and post whatever they like. When an upload endpoint
 * exists it MUST independently validate, on its own:
 *
 *     the real file type (sniffed from the bytes, never the declared MIME or extension)
 *     the declared MIME
 *     pixel dimensions
 *     byte size
 *     the allowed-format list
 *
 * Do not let a limit here stand in for a limit there.
 *
 * ── What it does ───────────────────────────────────────────────────────────────────────────
 *
 * Centre-crop to the target aspect, scale down to fit, re-encode, then step the quality down
 * until the result fits the byte budget. Prefers WebP (much smaller at the same quality) and
 * falls back to JPEG where the browser cannot encode it.
 *
 * Animated GIFs are the one case that cannot go through a canvas: drawing one to a canvas
 * silently keeps frame ONE and throws the animation away, while still reporting success. So an
 * animated GIF is passed through untouched and merely size-checked, against its own larger
 * budget, because there is no honest way to recompress it here. If it does not fit, the caller
 * is told exactly that and can offer to keep the first frame as a still — a choice the rider
 * makes, not one this module makes for them.
 *
 * Supersedes lib/cover-image.ts, which is now a thin wrapper over this so the event-create
 * cover flow keeps its exact previous behaviour.
 */

export interface ImageSpec {
  maxWidth: number;
  maxHeight: number;
  /** Centre-crop target. Null keeps the source aspect (what the legacy cover flow does). */
  aspectRatio: number | null;
  /** Budget for a re-encodable still image. */
  maxBytes: number;
  /** Budget for an animated GIF, which we cannot recompress — necessarily more generous. */
  animatedMaxBytes: number;
  quality: number;
  /** Below this the picture looks worse than a rejection reads. */
  minQuality: number;
}

export const AVATAR_SPEC: ImageSpec = {
  maxWidth: 256,
  maxHeight: 256,
  aspectRatio: 1,
  maxBytes: 20 * 1024,
  animatedMaxBytes: 256 * 1024,
  quality: 0.86,
  minQuality: 0.5,
};

export const COVER_SPEC: ImageSpec = {
  maxWidth: 1200,
  maxHeight: 450,
  aspectRatio: 1200 / 450,
  maxBytes: 100 * 1024,
  animatedMaxBytes: 512 * 1024,
  quality: 0.84,
  minQuality: 0.54,
};

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
/** For an <input type="file"> accept attribute. */
export const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

export type ImageProblem =
  | "unsupported-type"
  | "decode-failed"
  | "canvas-unavailable"
  | "too-large"
  | "animated-too-large";

export class ImageProcessingError extends Error {
  readonly problem: ImageProblem;
  /** True when keeping only the first frame would very likely succeed — the UI can offer it. */
  readonly canFlatten: boolean;

  constructor(problem: ImageProblem, message: string, canFlatten = false) {
    super(message);
    this.name = "ImageProcessingError";
    this.problem = problem;
    this.canFlatten = canFlatten;
  }
}

export interface ProcessedImage {
  /** Ready for an <img src>, for a CSS url(), and for local persistence. */
  dataUrl: string;
  /** The same bytes, ready to be posted as multipart without re-encoding. */
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  /** True only for a GIF that was passed through with its animation intact. */
  animated: boolean;
}

export interface ProcessOptions {
  /**
   * Flatten an animated GIF to its first frame instead of preserving it. Only ever set from an
   * explicit user choice after an "animated-too-large" failure — never as a silent default.
   */
  flattenAnimated?: boolean;
  /** Painted behind images with transparency when falling back to JPEG, which has no alpha. */
  background?: string;
}

function dataUrlSizeBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

let webpSupport: boolean | null = null;

/** Cached — Safari before 14 cannot encode WebP, and asking costs a canvas each time. */
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/**
 * Does this GIF animate?
 *
 * Counts Graphic Control Extension blocks (0x21 0xF9): a still GIF has at most one, an animated
 * one has a delay block per frame. Byte-level and dependency-free — the alternative is decoding
 * the whole thing or pulling in a GIF library, and neither is worth it to answer yes/no.
 *
 * Errs toward "animated": a wrong "yes" costs a slightly larger file, a wrong "no" destroys the
 * animation, which is the failure this whole path exists to avoid.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (header !== "GIF8") return false;

  let blocks = 0;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      blocks++;
      if (blocks > 1) return true;
    }
  }
  return false;
}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new ImageProcessingError("decode-failed", "That image could not be read."));
    image.src = objectUrl;
  });
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

interface RenderOptions {
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number | null;
  maxBytes: number;
  quality: number;
  minQuality: number;
  mime: string;
  background?: string;
}

/** Centre-crop, scale, encode, then walk the quality down until it fits. */
function renderToDataUrl(
  image: HTMLImageElement,
  options: RenderOptions,
): { dataUrl: string; width: number; height: number } {
  const { maxWidth, maxHeight, aspectRatio, maxBytes, minQuality, mime, background } = options;

  let srcX = 0;
  let srcY = 0;
  let srcWidth = image.naturalWidth || image.width;
  let srcHeight = image.naturalHeight || image.height;

  if (aspectRatio != null && aspectRatio > 0) {
    const imageRatio = srcWidth / srcHeight;
    if (imageRatio > aspectRatio) {
      srcWidth = Math.round(srcHeight * aspectRatio);
      srcX = Math.floor(((image.naturalWidth || image.width) - srcWidth) / 2);
    } else if (imageRatio < aspectRatio) {
      srcHeight = Math.round(srcWidth / aspectRatio);
      srcY = Math.floor(((image.naturalHeight || image.height) - srcHeight) / 2);
    }
  }

  // Never upscale: a 90x90 photo becomes a 90x90 avatar, not a blurry 256x256 one.
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
  const width = Math.max(1, Math.round(srcWidth * ratio));
  const height = Math.max(1, Math.round(srcHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageProcessingError("canvas-unavailable", "This browser could not resize images.");
  }

  // JPEG has no alpha: without this, a transparent PNG comes out with black edges.
  if (background && mime === "image/jpeg") {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, srcX, srcY, srcWidth, srcHeight, 0, 0, width, height);

  // Step exactly as lib/cover-image.ts always has (0.08 per step, floor tested BEFORE the
  // decrement) so the legacy event-cover path produces byte-identical output to before.
  let quality = options.quality;
  let dataUrl = canvas.toDataURL(mime, quality);
  while (dataUrlSizeBytes(dataUrl) > maxBytes && quality > minQuality) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL(mime, quality);
  }

  return { dataUrl, width, height };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new ImageProcessingError("decode-failed", "That file could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepare one picked file for use as an avatar or a cover.
 *
 * Throws ImageProcessingError with a `problem` code and a message worth showing a rider.
 */
export async function processIdentityImage(
  file: File,
  spec: ImageSpec,
  options: ProcessOptions = {},
): Promise<ProcessedImage> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageProcessingError(
      "unsupported-type",
      "Use a JPEG, PNG, WebP or GIF image.",
    );
  }

  // --- animated GIF: pass through, never canvas it ---
  if (file.type === "image/gif" && !options.flattenAnimated) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isAnimatedGif(bytes)) {
      if (file.size > spec.animatedMaxBytes) {
        throw new ImageProcessingError(
          "animated-too-large",
          `This animated GIF is ${Math.round(file.size / 1024)} KB. Animation can't be ` +
            `compressed here, so the limit is ${Math.round(spec.animatedMaxBytes / 1024)} KB. ` +
            `Use a smaller GIF, or keep just its first frame as a still image.`,
          true,
        );
      }
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = await loadImage(objectUrl);
        return {
          dataUrl: await readAsDataUrl(file),
          blob: file,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          bytes: file.size,
          mime: "image/gif",
          animated: true,
        };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  // --- everything else: crop, scale, re-encode ---
  const mime = supportsWebp() ? "image/webp" : "image/jpeg";
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { dataUrl, width, height } = renderToDataUrl(image, {
      maxWidth: spec.maxWidth,
      maxHeight: spec.maxHeight,
      aspectRatio: spec.aspectRatio,
      maxBytes: spec.maxBytes,
      quality: spec.quality,
      minQuality: spec.minQuality,
      mime,
      background: options.background ?? "#ffffff",
    });

    const bytes = dataUrlSizeBytes(dataUrl);
    if (bytes > spec.maxBytes) {
      throw new ImageProcessingError(
        "too-large",
        `That image is still ${Math.round(bytes / 1024)} KB after compressing, over the ` +
          `${Math.round(spec.maxBytes / 1024)} KB limit. Try a simpler or smaller picture.`,
      );
    }

    return {
      dataUrl,
      blob: dataUrlToBlob(dataUrl, mime),
      width,
      height,
      bytes,
      mime,
      animated: false,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * The legacy event-cover path, kept behaviour-identical: JPEG, source aspect, its own budget.
 * lib/cover-image.ts re-exports this so pages/EventCreatePage.tsx is untouched.
 */
export async function resizeToJpegDataUrl(
  file: File,
  options: { maxWidth: number; maxHeight: number; quality: number; maxBytes: number; aspectRatio: number | null },
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { dataUrl } = renderToDataUrl(image, {
      ...options,
      minQuality: 0.56,
      mime: "image/jpeg",
      background: "#ffffff",
    });
    if (dataUrlSizeBytes(dataUrl) > options.maxBytes) {
      throw new ImageProcessingError(
        "too-large",
        "Image is too large. Please choose a smaller photo.",
      );
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
