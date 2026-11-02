import { IMAGE_LIMITS, sniffImageType } from "../core/images.ts";
import type { ImageType } from "../core/images.ts";

export type EncodeError = "unreadable" | "too-large";

const QUALITIES = [0.85, 0.75, 0.6, 0.45];

/**
 * Scales a picture to at most IMAGE_LIMITS.maxSide pixels and encodes it as WebP within IMAGE_LIMITS.maxBytes.
 * Browsers that cannot encode WebP (older Safari) get JPEG. Rejects with an EncodeError.
 */
export async function encodeImage(file: Blob): Promise<{ type: ImageType; bytes: Uint8Array }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw "unreadable" satisfies EncodeError;
  }
  try {
    let scale = Math.min(1, IMAGE_LIMITS.maxSide / Math.max(bitmap.width, bitmap.height));
    // Shrink further if even the lowest quality is too large (rare: very detailed pictures).
    for (let attempt = 0; attempt < 4; attempt++, scale *= 0.75) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw "unreadable" satisfies EncodeError;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const mime of ["image/webp", "image/jpeg"] as const) {
        for (const quality of QUALITIES) {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
          if (!blob) break;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const type = sniffImageType(bytes);
          if (type !== mime) break; // e.g. PNG fallback: this browser cannot encode that format
          if (bytes.length <= IMAGE_LIMITS.maxBytes) return { type, bytes };
        }
      }
    }
    throw "too-large" satisfies EncodeError;
  } finally {
    bitmap.close();
  }
}
