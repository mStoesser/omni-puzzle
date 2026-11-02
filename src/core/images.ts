import { sha256Bytes } from "./hash.ts";

// Images (M14, quiz questions). Documents only reference them by key (SHA-256 of the bytes) and alt text;
// the bytes live in IndexedDB until publishing, then in Supabase Storage at quiz-images/<puzzle id>/<key>.

export const IMAGE_LIMITS = {
  maxBytes: 200_000, // also the bucket's file_size_limit (supabase/migrations/0008_images.sql)
  maxSide: 1024, // pixels; larger pictures are scaled down in the browser
  maxPerPuzzle: 10,
  maxAlt: 300,
} as const;

export const IMAGE_KEY = /^[0-9a-f]{64}$/;

export type ImageType = "image/webp" | "image/jpeg";

/** A picture in a puzzle; `alt` is required (accessibility, and shown instead of the image in share links). */
export type ImageRef = { key: string; alt: string };

export function imageKey(bytes: Uint8Array): string {
  return sha256Bytes(bytes);
}

/** The type from the file's magic bytes; null for anything but WebP and JPEG. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Why image bytes are not acceptable for `key`, or null if they are. */
export function imageProblem(key: string, bytes: Uint8Array): "too-large" | "type" | "key" | null {
  if (bytes.length > IMAGE_LIMITS.maxBytes) return "too-large";
  if (!sniffImageType(bytes)) return "type";
  if (imageKey(bytes) !== key) return "key";
  return null;
}

/** Base64 for JSON transport; chunked, so large arrays do not overflow the argument list. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Throws on malformed input. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Public URL of a published image. */
export function publishedImageUrl(projectUrl: string, puzzleId: string, key: string): string {
  return `${projectUrl}/storage/v1/object/public/quiz-images/${puzzleId}/${key}`;
}
