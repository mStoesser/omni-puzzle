import { DocumentError, validateEnvelope } from "./document.ts";
import type { PuzzleDocument } from "./types.ts";

// Code format: "<codec version>.<base64url(deflate-raw(utf8(json)))>"
const CODEC_VERSION = "1";

/** Longest code accepted when decoding (generous; the editor aims for much shorter links). */
export const MAX_CODE_LENGTH = 20_000;
/** Largest decompressed JSON accepted; protects against compression bombs. */
export const MAX_JSON_BYTES = 256 * 1024;

type ByteTransform = {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<BufferSource>;
};

export async function encodeDocument(doc: PuzzleDocument): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const compressed = await pipeBytes(json, new CompressionStream("deflate-raw"), Infinity);
  return `${CODEC_VERSION}.${toBase64Url(compressed)}`;
}

/** Decodes an untrusted share code. Throws DocumentError. Type-specific validation is up to the caller. */
export async function decodeDocument(code: string): Promise<PuzzleDocument> {
  if (code.length > MAX_CODE_LENGTH) throw new DocumentError("too-large", "code");
  const dot = code.indexOf(".");
  if (dot < 0) throw new DocumentError("invalid", "missing codec version");
  if (code.slice(0, dot) !== CODEC_VERSION) throw new DocumentError("unsupported", "codec version");

  const compressed = fromBase64Url(code.slice(dot + 1));
  let json: string;
  try {
    const bytes = await pipeBytes(compressed, new DecompressionStream("deflate-raw"), MAX_JSON_BYTES);
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("invalid", "decompression failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DocumentError("invalid", "json");
  }
  return validateEnvelope(parsed);
}

async function pipeBytes(input: Uint8Array<ArrayBuffer>, transform: ByteTransform, maxBytes: number) {
  const writer = transform.writable.getWriter();
  // Errors surface on the readable side; avoid unhandled rejections here.
  writer.write(input).catch(() => {});
  writer.close().catch(() => {});

  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new DocumentError("too-large", "decompressed size");
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new DocumentError("invalid", "base64url");
  }
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
