// Ride-cover uploads are capped at 250 KB by the server. A phone photo or a big PNG is far larger,
// and the server crops every cover to 1200x450 anyway — so shrink in the browser first instead of
// making the admin do it by hand. Accepts a source up to 4 MB (bigger is refused here, before the
// server is involved); a file already under 250 KB goes up untouched. Never crops (the server does that), only scales down and re-encodes.

/** The server refuses anything over 250 KB (server: config/ride-image-uploads.ts); aim just under. */
export const UPLOAD_TARGET_BYTES = 240 * 1024;
/** Anything bigger than this is not even attempted — decoding a huge file in the browser is slow. */
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
/** Longest side we keep. The cover is 1200 wide, so anything past this is wasted bytes. */
const MAX_SIDE = 2000;

/** Pure: the size to draw at so the longest side is at most `maxSide`, never upscaling. */
export function scaledSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns `file` unchanged when it is already small enough, otherwise a scaled-down WebP (or JPEG
 * where the browser cannot encode WebP) under UPLOAD_TARGET_BYTES. Throws a readable Error if it
 * cannot get it small enough or the file cannot be decoded.
 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `This image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The most I accept is 4 MB.`,
    );
  }
  if (file.size <= UPLOAD_TARGET_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file could not be read as an image.");
  }

  let side = MAX_SIDE;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { width, height } = scaledSize(bitmap.width, bitmap.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not resize the image in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.85, 0.7, 0.55, 0.4, 0.3]) {
        let blob = await toBlob(canvas, "image/webp", quality);
        // Browsers that cannot encode WebP silently return PNG; ask for JPEG instead.
        if (blob?.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
        if (blob && blob.size <= UPLOAD_TARGET_BYTES) {
          const extension = blob.type === "image/webp" ? "webp" : "jpg";
          const name = file.name.replace(/\.[^.]+$/, "") || "cover";
          return new File([blob], `${name}.${extension}`, { type: blob.type });
        }
      }
      side = Math.round(side * 0.75); // still too big — scale down and try again
    }
  } finally {
    bitmap.close();
  }
  throw new Error("This image is too large even after shrinking. Try a smaller picture.");
}
