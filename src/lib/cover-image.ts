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

function dataUrlSizeBytes(dataUrl: string): number {
   const comma = dataUrl.indexOf(",");
   if (comma === -1) return dataUrl.length;
   const base64 = dataUrl.slice(comma + 1);
   return Math.floor((base64.length * 3) / 4);
}

function loadImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
   return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = objectUrl;
   });
}

export async function resizeCoverFileToDataUrl(
   file: File,
   options: Partial<ResizeCoverOptions> = {},
): Promise<string> {
   const { maxWidth, maxHeight, quality, maxBytes, aspectRatio } = {
      ...DEFAULT_OPTIONS,
      ...options,
   };
   const objectUrl = URL.createObjectURL(file);

   try {
      const image = await loadImageFromObjectUrl(objectUrl);

      let srcX = 0;
      let srcY = 0;
      let srcWidth = image.width;
      let srcHeight = image.height;

      if (aspectRatio != null && aspectRatio > 0) {
         const imageRatio = image.width / image.height;
         if (imageRatio > aspectRatio) {
            srcWidth = Math.round(image.height * aspectRatio);
            srcX = Math.floor((image.width - srcWidth) / 2);
         } else if (imageRatio < aspectRatio) {
            srcHeight = Math.round(image.width / aspectRatio);
            srcY = Math.floor((image.height - srcHeight) / 2);
         }
      }

      const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1);
      const width = Math.max(1, Math.round(srcWidth * ratio));
      const height = Math.max(1, Math.round(srcHeight * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not resize image.");

      context.drawImage(image, srcX, srcY, srcWidth, srcHeight, 0, 0, width, height);

      let nextQuality = quality;
      let dataUrl = canvas.toDataURL("image/jpeg", nextQuality);

      // Keep shrinking quality until the local payload is reasonably small for persisted state.
      while (dataUrlSizeBytes(dataUrl) > maxBytes && nextQuality > 0.56) {
         nextQuality -= 0.08;
         dataUrl = canvas.toDataURL("image/jpeg", nextQuality);
      }

      if (dataUrlSizeBytes(dataUrl) > maxBytes) {
         throw new Error("Image is too large. Please choose a smaller photo.");
      }

      return dataUrl;
   } finally {
      URL.revokeObjectURL(objectUrl);
   }
}
