import { svg } from "lit-html";
import type { TemplateResult } from "lit-html";
import type { PuzzleDocument, PuzzleType } from "./types.ts";

// A minimal puzzle type for core tests: move a counter by +1/-1 until it reaches the target.
// Version 2; version 1 stored the target as `goal`.
export type CounterData = { target: number };

export const counterType: PuzzleType<CounterData, number, 1 | -1> = {
  id: "counter",
  version: 2,
  name: "appTitle",
  description: "appTitle",
  icon: svg`<path d="M4 4h16v16H4z"/>`,
  color: { dark: "#cccccc", light: "#333333" },
  createDefault: () => ({ target: 3 }),
  validate(data) {
    if (typeof data !== "object" || data === null) throw new Error("not an object");
    const target = (data as Record<string, unknown>).target;
    if (!Number.isInteger(target) || (target as number) < 0) throw new Error("bad target");
    return { target: target as number };
  },
  migrate(data, fromVersion) {
    if (fromVersion === 1) return { target: (data as { goal: unknown }).goal };
    return data;
  },
  initState: () => 0,
  applyMove: (_data, state, move) => (state + move < 0 ? null : state + move),
  isSolved: (data, state) => state === data.target,
  themeRoles: ["board", "piece"],
  renderPlay: () => null as unknown as TemplateResult,
  renderEditor: () => null as unknown as TemplateResult,
};

export function counterDocument(target: number): PuzzleDocument<CounterData> {
  return {
    format: 1,
    type: "counter",
    typeVersion: 2,
    meta: { title: "Zähler", createdAt: "2026-10-29T12:00:00.000Z" },
    data: { target },
  };
}

/** A tiny fake WebP file; the server only checks the header, size and hash. */
export function fakeWebp(seed: number): Uint8Array {
  const bytes = new Uint8Array(64).map((_, i) => (i * seed) & 0xff);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  return bytes;
}
