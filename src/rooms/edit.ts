// Escape rooms (M45): pure editing operations for the editor. They never mutate and keep references consistent:
// deleting a scene, switch, lock, view or puzzle also removes what points to it.

import { loadDocument, DocumentError } from "../core/document.ts";
import type { Registry } from "../core/registry.ts";
import type { AnyPuzzleRules, PuzzleDocument, PuzzleLang } from "../core/types.ts";
import { MIN_SPOT, ROOM_LIMITS } from "./logic.ts";
import type { Condition, Effect, EscapeRoomData, EscapeRoomDocument, ImageRef, Lock, Rect, Scene, Spot, View } from "./logic.ts";

// --- Ids and new items ---

/** The first free id `prefix-1`, `prefix-2`, … */
export function freeId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${prefix}-${i}`;
    if (!used.has(id)) return id;
  }
}

export function newEscapeRoom(title: string, lang: PuzzleLang, createdAt: string, sceneName: string): EscapeRoomDocument {
  return {
    format: 1,
    kind: "escape-room",
    version: 1,
    meta: { title, createdAt, lang },
    data: { start: "scene-1", flags: [], scenes: [{ id: "scene-1", name: sceneName, image: { builtin: "study" }, hints: [], spots: [] }], puzzles: [], locks: [], views: [] },
  };
}

// --- Rectangles ---

const round = (n: number) => Math.round(n * 10) / 10;

/** Keeps a tap area inside the picture and at least MIN_SPOT large; rounded to 0.1 %. */
export function clampRect(r: Rect): Rect {
  const w = round(Math.min(100, Math.max(MIN_SPOT.w, r.w)));
  const h = round(Math.min(100, Math.max(MIN_SPOT.h, r.h)));
  const x = round(Math.min(100 - w, Math.max(0, r.x)));
  const y = round(Math.min(100 - h, Math.max(0, r.y)));
  return { x, y, w, h };
}

/** A rectangle between two points (in percent), e.g. from dragging on the picture. */
export function rectBetween(ax: number, ay: number, bx: number, by: number): Rect {
  return clampRect({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
}

// --- Generic helpers ---

function mapEffects(data: EscapeRoomData, keep: (e: Effect) => boolean): EscapeRoomData {
  const filter = (list: readonly Effect[]) => (list.every(keep) ? list : list.filter(keep));
  return {
    ...data,
    scenes: data.scenes.map((s) => ({ ...s, spots: s.spots.map((spot) => ({ ...spot, action: filter(spot.action) })) })),
    puzzles: data.puzzles.map((p) => ({ ...p, onSolve: filter(p.onSolve) })),
    locks: data.locks.map((l) => ({ ...l, onOpen: filter(l.onOpen) })),
  };
}

function replaceById<T extends { id: string }>(items: readonly T[], id: string, change: (item: T) => T): T[] {
  return items.map((item) => (item.id === id ? change(item) : item));
}

// --- Scenes ---

export function addScene(data: EscapeRoomData, name: string, image: ImageRef = { builtin: "study" }): { data: EscapeRoomData; id: string } {
  if (data.scenes.length >= ROOM_LIMITS.scenes) return { data, id: "" };
  const id = freeId("scene", data.scenes.map((s) => s.id));
  return { data: { ...data, scenes: [...data.scenes, { id, name, image, hints: [], spots: [] }] }, id };
}

export function updateScene(data: EscapeRoomData, id: string, change: Partial<Omit<Scene, "id" | "spots">>): EscapeRoomData {
  return { ...data, scenes: replaceById(data.scenes, id, (s) => ({ ...s, ...change })) };
}

/** The last scene cannot be removed. The start moves to the first remaining scene. */
export function removeScene(data: EscapeRoomData, id: string): EscapeRoomData {
  if (data.scenes.length <= 1) return data;
  const without = mapEffects(data, (e) => !(e.do === "go" && e.scene === id));
  const scenes = without.scenes.filter((s) => s.id !== id);
  return { ...without, scenes, start: data.start === id ? scenes[0]!.id : data.start };
}

// --- Spots ---

export function addSpot(data: EscapeRoomData, sceneId: string, rect: Rect, label: string): { data: EscapeRoomData; id: string } {
  const scene = data.scenes.find((s) => s.id === sceneId);
  if (!scene || scene.spots.length >= ROOM_LIMITS.spots) return { data, id: "" };
  const id = freeId("spot", scene.spots.map((s) => s.id));
  const spot: Spot = { id, label, rect: clampRect(rect), when: [], action: [] };
  return { data: { ...data, scenes: replaceById(data.scenes, sceneId, (s) => ({ ...s, spots: [...s.spots, spot] })) }, id };
}

export function updateSpot(data: EscapeRoomData, sceneId: string, spotId: string, change: Partial<Omit<Spot, "id">>): EscapeRoomData {
  const fixed = change.rect ? { ...change, rect: clampRect(change.rect) } : change;
  return { ...data, scenes: replaceById(data.scenes, sceneId, (s) => ({ ...s, spots: replaceById(s.spots, spotId, (spot) => ({ ...spot, ...fixed })) })) };
}

export function removeSpot(data: EscapeRoomData, sceneId: string, spotId: string): EscapeRoomData {
  return { ...data, scenes: replaceById(data.scenes, sceneId, (s) => ({ ...s, spots: s.spots.filter((spot) => spot.id !== spotId) })) };
}

// --- Switches ---

export function addFlag(data: EscapeRoomData, name: string): { data: EscapeRoomData; id: string } {
  if (data.flags.length >= ROOM_LIMITS.flags) return { data, id: "" };
  const id = freeId("flag", data.flags.map((f) => f.id));
  return { data: { ...data, flags: [...data.flags, { id, name }] }, id };
}

export function renameFlag(data: EscapeRoomData, id: string, name: string): EscapeRoomData {
  return { ...data, flags: replaceById(data.flags, id, (f) => ({ ...f, name })) };
}

/** Also removes the conditions and effects that use the switch. */
export function removeFlag(data: EscapeRoomData, id: string): EscapeRoomData {
  const without = mapEffects(data, (e) => !(e.do === "flag" && e.flag === id));
  const keep = (c: Condition) => c.flag !== id;
  return {
    ...without,
    flags: data.flags.filter((f) => f.id !== id),
    scenes: without.scenes.map((s) => ({ ...s, spots: s.spots.map((spot) => (spot.when.every(keep) ? spot : { ...spot, when: spot.when.filter(keep) })) })),
  };
}

// --- Locks ---

export function addLock(data: EscapeRoomData, name: string): { data: EscapeRoomData; id: string } {
  if (data.locks.length >= ROOM_LIMITS.locks) return { data, id: "" };
  const id = freeId("lock", data.locks.map((l) => l.id));
  return { data: { ...data, locks: [...data.locks, { id, name, code: "", onOpen: [] }] }, id };
}

export function updateLock(data: EscapeRoomData, id: string, change: Partial<Omit<Lock, "id">>): EscapeRoomData {
  return { ...data, locks: replaceById(data.locks, id, (l) => ({ ...l, ...change })) };
}

export function removeLock(data: EscapeRoomData, id: string): EscapeRoomData {
  const without = mapEffects(data, (e) => !(e.do === "lock" && e.lock === id));
  return { ...without, locks: without.locks.filter((l) => l.id !== id) };
}

// --- Views ---

export function addView(data: EscapeRoomData, name: string): { data: EscapeRoomData; id: string } {
  if (data.views.length >= ROOM_LIMITS.views) return { data, id: "" };
  const id = freeId("view", data.views.map((v) => v.id));
  return { data: { ...data, views: [...data.views, { id, name }] }, id };
}

export function updateView(data: EscapeRoomData, id: string, change: Partial<Omit<View, "id">>): EscapeRoomData {
  return {
    ...data,
    views: replaceById(data.views, id, (v) => {
      const next: View = { ...v, ...change };
      if (change.image === undefined && "image" in change) delete next.image;
      if (change.text === undefined && "text" in change) delete next.text;
      return next;
    }),
  };
}

export function removeView(data: EscapeRoomData, id: string): EscapeRoomData {
  const without = mapEffects(data, (e) => !(e.do === "view" && e.view === id));
  return { ...without, views: without.views.filter((v) => v.id !== id) };
}

// --- Puzzles ---

/** A copy of a puzzle (e.g. from the library) becomes part of the room. */
export function addPuzzle(data: EscapeRoomData, doc: PuzzleDocument, name: string): { data: EscapeRoomData; id: string } {
  if (data.puzzles.length >= ROOM_LIMITS.puzzles) return { data, id: "" };
  const id = freeId("puzzle", data.puzzles.map((p) => p.id));
  return { data: { ...data, puzzles: [...data.puzzles, { id, name, doc: structuredClone(doc), onSolve: [] }] }, id };
}

export function renamePuzzle(data: EscapeRoomData, id: string, name: string): EscapeRoomData {
  return { ...data, puzzles: replaceById(data.puzzles, id, (p) => ({ ...p, name })) };
}

/** The result the puzzle shows when solved (meta.result, M42); blank = none. */
export function setPuzzleResult(data: EscapeRoomData, id: string, result: string): EscapeRoomData {
  return {
    ...data,
    puzzles: replaceById(data.puzzles, id, (p) => {
      const meta = { ...p.doc.meta };
      const clean = result.trim();
      if (clean) meta.result = clean;
      else delete meta.result;
      return { ...p, doc: { ...p.doc, meta } };
    }),
  };
}

export function setPuzzleEffects(data: EscapeRoomData, id: string, onSolve: readonly Effect[]): EscapeRoomData {
  return { ...data, puzzles: replaceById(data.puzzles, id, (p) => ({ ...p, onSolve })) };
}

export function removePuzzle(data: EscapeRoomData, id: string): EscapeRoomData {
  const without = mapEffects(data, (e) => !(e.do === "puzzle" && e.puzzle === id));
  return { ...without, puzzles: without.puzzles.filter((p) => p.id !== id) };
}

// --- Effects ---

/** Effects that open something; a list may have at most one, and after solving or opening only a view. */
export function opens(effect: Effect): boolean {
  return effect.do === "puzzle" || effect.do === "lock" || effect.do === "view";
}

/** Which kinds of effect may be added to a list (`opening`: a tap area's action; otherwise onSolve/onOpen). */
export function allowedEffects(list: readonly Effect[], opening: boolean): Effect["do"][] {
  const hasOpening = list.some(opens);
  const kinds: Effect["do"][] = ["go", "flag", "win"];
  if (!hasOpening) kinds.unshift(...(opening ? (["puzzle", "lock", "view"] as const) : (["view"] as const)));
  return list.length >= ROOM_LIMITS.effects ? [] : kinds;
}

// --- Problems of a draft ---

export type DraftProblemCode =
  | "scene-name" // id = scene
  | "spot-label" // id = scene/spot
  | "spot-action" // id = scene/spot: the tap area does nothing yet
  | "hint-empty" // id = scene
  | "flag-name"
  | "lock-name"
  | "lock-code"
  | "view-name"
  | "view-empty" // neither picture nor text
  | "puzzle-name"
  | "puzzle-invalid"; // the embedded puzzle is a draft that cannot be played

export type DraftProblem = { code: DraftProblemCode; id: string };

/**
 * What a draft still lacks before it can be played (what `loadEscapeRoom` without `draft` would refuse), so the editor
 * can point to it. Empty = the room can be test played.
 */
export function draftProblems<T extends AnyPuzzleRules>(data: EscapeRoomData, registry: Registry<T>): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const add = (code: DraftProblemCode, id: string) => problems.push({ code, id });
  for (const scene of data.scenes) {
    if (scene.name.trim() === "") add("scene-name", scene.id);
    if (scene.hints.some((h) => h.trim() === "")) add("hint-empty", scene.id);
    for (const spot of scene.spots) {
      if (spot.label.trim() === "") add("spot-label", `${scene.id}/${spot.id}`);
      if (spot.action.length === 0) add("spot-action", `${scene.id}/${spot.id}`);
    }
  }
  for (const f of data.flags) if (f.name.trim() === "") add("flag-name", f.id);
  for (const l of data.locks) {
    if (l.name.trim() === "") add("lock-name", l.id);
    if (l.code.replace(/\s+/g, "") === "") add("lock-code", l.id);
  }
  for (const v of data.views) {
    if (v.name.trim() === "") add("view-name", v.id);
    if (!v.image && !v.text?.trim()) add("view-empty", v.id);
  }
  for (const p of data.puzzles) {
    if (p.name.trim() === "") add("puzzle-name", p.id);
    try {
      loadDocument(p.doc, registry);
    } catch (error) {
      if (!(error instanceof DocumentError)) throw error;
      add("puzzle-invalid", p.id);
    }
  }
  return problems;
}

// --- Pictures ---

/** The own pictures a room uses (scenes, views, and those of its puzzles), e.g. so the image cleanup keeps them. */
export function roomImageKeys<T extends AnyPuzzleRules>(data: EscapeRoomData, registry: Registry<T>): string[] {
  const keys = new Set<string>();
  const ref = (image: ImageRef | undefined) => image && "key" in image && keys.add(image.key);
  for (const scene of data.scenes) ref(scene.image);
  for (const view of data.views) ref(view.image);
  for (const puzzle of data.puzzles) {
    for (const key of registry.get(puzzle.doc.type)?.imageKeys?.(puzzle.doc.data) ?? []) keys.add(key);
  }
  return [...keys];
}
