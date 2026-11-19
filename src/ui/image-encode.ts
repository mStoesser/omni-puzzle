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

/** Escape room scenes (M45) are 16:9: the middle of a picture, cropped to that shape (before `encodeImage`). */
export async function cropTo16x9(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw "unreadable" satisfies EncodeError;
  }
  try {
    const ratio = 16 / 9;
    const w = Math.min(bitmap.width, bitmap.height * ratio);
    const h = w / ratio;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(Math.min(w, 1600)));
    canvas.height = Math.max(1, Math.round(canvas.width / ratio));
    const context = canvas.getContext("2d");
    if (!context) throw "unreadable" satisfies EncodeError;
    context.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw "unreadable" satisfies EncodeError;
    return blob;
  } finally {
    bitmap.close();
  }
}
