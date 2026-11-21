// Escape rooms (Phase 6, M43): the document format, loading untrusted documents, and the progress as a pure function of
// events. Pure and DOM-free like puzzle logic. An escape room is not a puzzle type: it embeds puzzle documents and
// touches the core on purpose (CLAUDE.md, rule 5).
//
// Naming: the whole game is the "escape room"; each of its rooms (a background picture with tap areas) is a "scene".

import { DocumentError, loadDocument } from "../core/document.ts";
import type { Registry } from "../core/registry.ts";
import { IMAGE_KEY } from "../core/images.ts";
import { isPuzzleLang } from "../core/types.ts";
import { parseComposition } from "./compose.ts";
import type { Composition } from "./compose.ts";
import type { AnyPuzzleRules, PuzzleDocument, PuzzleLang } from "../core/types.ts";

// --- Format ---

export const ROOM_FORMAT = 1;
/**
 * The newest version this app reads. A room is stored with the lowest version that holds its data (`roomVersion`):
 * version 2 (M49) only for rooms with a picture built from parts. So older apps still open all other rooms, and their
 * save keys (which include the version) stay the same.
 */
export const ROOM_VERSION = 2;

export type EscapeRoomMeta = {
  title: string;
  createdAt: string; // ISO date
  author?: string;
  description?: string;
  lang?: PuzzleLang;
  verified?: boolean; // won by its creator
};

export type EscapeRoomDocument = {
  format: 1;
  kind: "escape-room";
  version: number;
  meta: EscapeRoomMeta;
  data: EscapeRoomData;
};

export type EscapeRoomData = {
  start: string; // scene id
  intro?: string; // shown before the first scene
  victory?: string; // shown when won
  flags: readonly Flag[];
  scenes: readonly Scene[];
  puzzles: readonly EmbeddedPuzzle[];
  locks: readonly Lock[];
  views: readonly View[];
};

/** A switch with a name for the editor. It only ever turns on (see Shared). */
export type Flag = { id: string; name: string };

/** One room: a 16:9 picture with tap areas. */
export type Scene = {
  id: string;
  name: string;
  image: ImageRef;
  text?: string; // shown when entering
  hints: readonly string[]; // given one after another on request
  spots: readonly Spot[];
};

/** A built-in picture (shipped with the app), an own one (image key, like in puzzles) or one built from parts (M49). */
export type ImageRef = { builtin: BuiltinImage } | { key: string } | { compose: Composition };

/** The pictures that come with the app (M44, simple SVG illustrations in 16:9; `ui/room-images.ts`). */
export const BUILTIN_IMAGES = ["study", "hall", "cellar", "lab"] as const;
export type BuiltinImage = (typeof BUILTIN_IMAGES)[number];

function isBuiltinImage(value: unknown): value is BuiltinImage {
  return (BUILTIN_IMAGES as readonly unknown[]).includes(value);
}

/** A tap area: a rectangle in percent of the scene picture. */
export type Spot = {
  id: string;
  label: string; // for screen readers and the editor
  rect: Rect;
  when: readonly Condition[]; // all must hold; empty = always
  action: readonly Effect[];
};

export type Rect = { x: number; y: number; w: number; h: number };

/** A switch is on (`on: true`) or still off. */
export type Condition = { flag: string; on: boolean };

/** A puzzle inside the escape room. Its result (meta.result, M42) is shown when solved; `onSolve` runs then. */
export type EmbeddedPuzzle = { id: string; name: string; doc: PuzzleDocument; onSolve: readonly Effect[] };

/** A code lock; `onOpen` runs when the right code is entered and again whenever an open lock is tapped. */
export type Lock = { id: string; name: string; prompt?: string; code: string; onOpen: readonly Effect[] };

/** Something to look at: a picture, a text, or both. */
export type View = { id: string; name: string; image?: ImageRef; text?: string };

/**
 * What happens. "puzzle", "lock" and "view" open something (at most one per list); the others act at once.
 * `onSolve` and `onOpen` cannot open puzzles or locks (one dialog leads to at most a view).
 */
export type Effect =
  | { do: "puzzle"; puzzle: string }
  | { do: "lock"; lock: string }
  | { do: "view"; view: string }
  | { do: "go"; scene: string }
  | { do: "flag"; flag: string }
  | { do: "win" };

export const ROOM_LIMITS = {
  maxDocBytes: 524_288,
  scenes: 20,
  spots: 30, // per scene
  puzzles: 30,
  locks: 30,
  views: 50,
  flags: 64,
  effects: 8, // per list
  conditions: 4, // per spot
  hints: 5, // per scene
  title: 200,
  author: 100,
  description: 2000,
  createdAt: 40,
  name: 60,
  label: 60,
  text: 1000,
  hint: 300,
  story: 2000, // intro and victory
  prompt: 200,
  code: 40,
} as const;

/** Smallest tap area in percent of the picture: about 44 px on a phone in landscape (16:9, ~800 px wide). */
export const MIN_SPOT = { w: 5, h: 9 } as const;

const ID = /^[a-z0-9-]{1,24}$/;

// --- Loading ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string): never {
  throw new DocumentError("invalid", path);
}

function text(value: unknown, max: number, path: string): string {
  if (typeof value !== "string" || [...value].length > max) fail(path);
  return value;
}

function optionalText(value: unknown, max: number, path: string): string | undefined {
  if (value === undefined) return undefined;
  const clean = text(value, max, path).trim();
  return clean === "" ? undefined : clean;
}

function needText(value: unknown, max: number, path: string): string {
  const clean = text(value, max, path).trim();
  if (clean === "") fail(path);
  return clean;
}

function list(value: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path);
  return value;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(path);
  return value;
}

/** Ids of one kind must be unique. */
function uniqueIds<T extends { id: string }>(items: readonly T[], path: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) fail(`${path}.${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function imageRef(value: unknown, path: string): ImageRef {
  if (!isRecord(value)) fail(path);
  // Exactly one of the three.
  if ([value.builtin, value.key, value.compose].filter((v) => v !== undefined).length !== 1) fail(path);
  if (isBuiltinImage(value.builtin)) return { builtin: value.builtin };
  if (typeof value.key === "string" && IMAGE_KEY.test(value.key)) return { key: value.key };
  const compose = parseComposition(value.compose);
  if (compose) return { compose };
  fail(path);
}

/** The lowest version that holds this data: 2 if some picture is built from parts (M49), else 1. */
export function roomVersion(data: EscapeRoomData): number {
  const composed = (image: ImageRef | undefined) => image !== undefined && "compose" in image;
  return data.scenes.some((s) => composed(s.image)) || data.views.some((v) => composed(v.image)) ? 2 : 1;
}

function rect(value: unknown, path: string): Rect {
  if (!isRecord(value)) fail(path);
  const [x, y, w, h] = [value.x, value.y, value.w, value.h].map((n) => (typeof n === "number" && Number.isFinite(n) ? n : NaN));
  if (!(x! >= 0 && y! >= 0 && w! >= MIN_SPOT.w && h! >= MIN_SPOT.h && x! + w! <= 100 && y! + h! <= 100)) fail(path);
  return { x: x!, y: y!, w: w!, h: h! };
}

type Refs = { scenes: Set<string>; puzzles: Set<string>; locks: Set<string>; views: Set<string>; flags: Set<string> };

/** `opening`: whether the list may open puzzles and locks (spot actions) or only views (onSolve, onOpen). */
function effects(value: unknown, refs: Refs, opening: boolean, path: string): Effect[] {
  const out: Effect[] = [];
  let opens = 0;
  for (const [i, raw] of list(value, ROOM_LIMITS.effects, path).entries()) {
    const at = `${path}.${i}`;
    if (!isRecord(raw)) fail(at);
    const ref = (key: string, known: Set<string>) => {
      const target = id(raw[key], at);
      if (!known.has(target)) fail(at);
      return target;
    };
    switch (raw.do) {
      case "puzzle":
        if (!opening) fail(at);
        out.push({ do: "puzzle", puzzle: ref("puzzle", refs.puzzles) });
        opens++;
        break;
      case "lock":
        if (!opening) fail(at);
        out.push({ do: "lock", lock: ref("lock", refs.locks) });
        opens++;
        break;
      case "view":
        out.push({ do: "view", view: ref("view", refs.views) });
        opens++;
        break;
      case "go":
        out.push({ do: "go", scene: ref("scene", refs.scenes) });
        break;
      case "flag":
        out.push({ do: "flag", flag: ref("flag", refs.flags) });
        break;
      case "win":
        out.push({ do: "win" });
        break;
      default:
        fail(at);
    }
  }
  if (opens > 1) fail(path);
  return out;
}

function meta(value: unknown): EscapeRoomMeta {
  if (!isRecord(value)) fail("meta");
  const clean: EscapeRoomMeta = {
    title: text(value.title, ROOM_LIMITS.title, "meta.title"),
    createdAt: text(value.createdAt, ROOM_LIMITS.createdAt, "meta.createdAt"),
  };
  const author = optionalText(value.author, ROOM_LIMITS.author, "meta.author");
  const description = optionalText(value.description, ROOM_LIMITS.description, "meta.description");
  if (author !== undefined) clean.author = author;
  if (description !== undefined) clean.description = description;
  if (isPuzzleLang(value.lang)) clean.lang = value.lang; // unknown languages are dropped, like in puzzles
  if (value.verified !== undefined) {
    if (typeof value.verified !== "boolean") fail("meta.verified");
    clean.verified = value.verified;
  }
  return clean;
}

/**
 * Checks an untrusted escape room and returns a clean copy without unknown fields. Embedded puzzles go through
 * `loadDocument` (envelope, type, migration, validation); every reference must point to an existing item.
 * Throws DocumentError. Whether the room can be won is not checked here, see `checkEscapeRoom`.
 * With `draft` (the editor, M45), what a creator fills in step by step may still be missing: empty names, labels and
 * codes, tap areas without an action, views without content, embedded puzzles that are drafts. `draftProblems` lists
 * these; structure, limits and references are checked as always.
 */
export function loadEscapeRoom<T extends AnyPuzzleRules>(raw: unknown, registry: Registry<T>, options: { draft?: boolean } = {}): EscapeRoomDocument {
  if (!isRecord(raw)) fail("not an object");
  if (raw.format !== ROOM_FORMAT) throw new DocumentError(typeof raw.format === "number" ? "unsupported" : "invalid", "format");
  if (raw.kind !== "escape-room") fail("kind");
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) fail("version");
  if ((raw.version as number) > ROOM_VERSION) throw new DocumentError("unsupported", "version");
  if (new TextEncoder().encode(JSON.stringify(raw)).length > ROOM_LIMITS.maxDocBytes) throw new DocumentError("too-large");
  const data = roomData(migrateRoom(raw.data, raw.version as number), registry, options.draft === true);
  return { format: 1, kind: "escape-room", version: roomVersion(data), meta: meta(raw.meta), data };
}

/** Older versions of the data become the current one here (none yet). */
function migrateRoom(data: unknown, _version: number): unknown {
  return data;
}

function roomData<T extends AnyPuzzleRules>(raw: unknown, registry: Registry<T>, draft: boolean): EscapeRoomData {
  if (!isRecord(raw)) fail("data");
  // In a draft, required texts may still be empty.
  const requiredText = (value: unknown, max: number, path: string) => (draft ? text(value, max, path).trim() : needText(value, max, path));
  const rawScenes = list(raw.scenes, ROOM_LIMITS.scenes, "scenes");
  const rawPuzzles = list(raw.puzzles, ROOM_LIMITS.puzzles, "puzzles");
  const rawLocks = list(raw.locks, ROOM_LIMITS.locks, "locks");
  const rawViews = list(raw.views, ROOM_LIMITS.views, "views");
  const rawFlags = list(raw.flags, ROOM_LIMITS.flags, "flags");
  if (rawScenes.length === 0) fail("scenes");
  const idOf = (item: unknown, path: string) => (isRecord(item) ? { id: id(item.id, path) } : fail(path));

  // Ids first, so effects may point to items defined later.
  const refs: Refs = {
    scenes: uniqueIds(rawScenes.map((s, i) => idOf(s, `scenes.${i}`)), "scenes"),
    puzzles: uniqueIds(rawPuzzles.map((s, i) => idOf(s, `puzzles.${i}`)), "puzzles"),
    locks: uniqueIds(rawLocks.map((s, i) => idOf(s, `locks.${i}`)), "locks"),
    views: uniqueIds(rawViews.map((s, i) => idOf(s, `views.${i}`)), "views"),
    flags: uniqueIds(rawFlags.map((s, i) => idOf(s, `flags.${i}`)), "flags"),
  };

  const flags = rawFlags.map((f, i) => {
    const r = f as Record<string, unknown>;
    return { id: r.id as string, name: requiredText(r.name, ROOM_LIMITS.name, `flags.${i}.name`) };
  });

  const views = rawViews.map((v, i): View => {
    const r = v as Record<string, unknown>;
    const at = `views.${i}`;
    const view: View = { id: r.id as string, name: requiredText(r.name, ROOM_LIMITS.name, `${at}.name`) };
    if (r.image !== undefined) view.image = imageRef(r.image, `${at}.image`);
    const body = optionalText(r.text, ROOM_LIMITS.text, `${at}.text`);
    if (body !== undefined) view.text = body;
    if (!draft && !view.image && view.text === undefined) fail(at);
    return view;
  });

  const locks = rawLocks.map((l, i): Lock => {
    const r = l as Record<string, unknown>;
    const at = `locks.${i}`;
    const code = requiredText(r.code, ROOM_LIMITS.code, `${at}.code`);
    if (!draft && normalizeCode(code) === "") fail(`${at}.code`);
    const lock: Lock = { id: r.id as string, name: requiredText(r.name, ROOM_LIMITS.name, `${at}.name`), code, onOpen: effects(r.onOpen, refs, false, `${at}.onOpen`) };
    const prompt = optionalText(r.prompt, ROOM_LIMITS.prompt, `${at}.prompt`);
    if (prompt !== undefined) lock.prompt = prompt;
    return lock;
  });

  const puzzles = rawPuzzles.map((p, i): EmbeddedPuzzle => {
    const r = p as Record<string, unknown>;
    const at = `puzzles.${i}`;
    let doc: PuzzleDocument;
    try {
      doc = loadDocument(r.doc, registry, { draft }).doc;
    } catch (error) {
      if (error instanceof DocumentError) throw new DocumentError(error.code, `${at}.doc: ${error.message}`);
      throw error;
    }
    return { id: r.id as string, name: requiredText(r.name, ROOM_LIMITS.name, `${at}.name`), doc, onSolve: effects(r.onSolve, refs, false, `${at}.onSolve`) };
  });

  const scenes = rawScenes.map((s, i): Scene => {
    const r = s as Record<string, unknown>;
    const at = `scenes.${i}`;
    const rawSpots = list(r.spots, ROOM_LIMITS.spots, `${at}.spots`);
    const spots = rawSpots.map((sp, j): Spot => {
      const spotAt = `${at}.spots.${j}`;
      if (!isRecord(sp)) fail(spotAt);
      const when = list(sp.when ?? [], ROOM_LIMITS.conditions, `${spotAt}.when`).map((c, k) => {
        const condAt = `${spotAt}.when.${k}`;
        if (!isRecord(c) || typeof c.on !== "boolean") fail(condAt);
        const flag = id(c.flag, condAt);
        if (!refs.flags.has(flag)) fail(condAt);
        return { flag, on: c.on };
      });
      const action = effects(sp.action, refs, true, `${spotAt}.action`);
      if (!draft && action.length === 0) fail(`${spotAt}.action`);
      return { id: id(sp.id, spotAt), label: requiredText(sp.label, ROOM_LIMITS.label, `${spotAt}.label`), rect: rect(sp.rect, `${spotAt}.rect`), when, action };
    });
    uniqueIds(spots, `${at}.spots`);
    const hints = list(r.hints ?? [], ROOM_LIMITS.hints, `${at}.hints`).map((h, k) => requiredText(h, ROOM_LIMITS.hint, `${at}.hints.${k}`));
    const scene: Scene = { id: r.id as string, name: requiredText(r.name, ROOM_LIMITS.name, `${at}.name`), image: imageRef(r.image, `${at}.image`), hints, spots };
    const body = optionalText(r.text, ROOM_LIMITS.text, `${at}.text`);
    if (body !== undefined) scene.text = body;
    return scene;
  });

  const start = id(raw.start, "start");
  if (!refs.scenes.has(start)) fail("start");
  const data: EscapeRoomData = { start, flags, scenes, puzzles, locks, views };
  const intro = optionalText(raw.intro, ROOM_LIMITS.story, "intro");
  const victory = optionalText(raw.victory, ROOM_LIMITS.story, "victory");
  if (intro !== undefined) data.intro = intro;
  if (victory !== undefined) data.victory = victory;
  return data;
}

// --- Codes ---

/** How codes are compared: without spaces, case does not matter ("ab 12" = "AB12"). */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toLocaleUpperCase("de");
}

export function codeMatches(input: string, code: string): boolean {
  return normalizeCode(input) === normalizeCode(code);
}

// --- Progress ---

/**
 * What a group shares (M47): it only grows, so two states merge without conflicts (`mergeShared`). Sorted lists of ids.
 */
export type Shared = {
  flags: readonly string[]; // switches that are on
  solved: readonly string[]; // puzzles
  opened: readonly string[]; // locks
  won: boolean;
};

/** One player's progress: where they are, and what is shared. */
export type Progress = { scene: string; shared: Shared };

/** Everything that changes the progress. Moves inside a puzzle are not events, only that it was solved. */
export type RoomEvent =
  | { kind: "spot"; spot: string } // tapped in the current scene
  | { kind: "solved"; puzzle: string }
  | { kind: "code"; lock: string; code: string };

/** What the player sees next: a puzzle, a lock's input or a view. */
export type Opening = { kind: "puzzle"; puzzle: string } | { kind: "lock"; lock: string } | { kind: "view"; view: string };

/** `accepted: false` = the event does not fit the progress (not tappable now, wrong code, unknown id); nothing changed. */
export type Step = { progress: Progress; open: Opening | null; accepted: boolean };

export const EMPTY_SHARED: Shared = { flags: [], solved: [], opened: [], won: false };

export function startProgress(data: EscapeRoomData): Progress {
  return { scene: data.start, shared: EMPTY_SHARED };
}

function added(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items : [...items, item].sort();
}

function union(a: readonly string[], b: readonly string[]): readonly string[] {
  return [...new Set([...a, ...b])].sort();
}

/** The progress of two players (or devices) together. Commutative, associative and idempotent. */
export function mergeShared(a: Shared, b: Shared): Shared {
  return { flags: union(a.flags, b.flags), solved: union(a.solved, b.solved), opened: union(a.opened, b.opened), won: a.won || b.won };
}

export function conditionsHold(when: readonly Condition[], shared: Shared): boolean {
  return when.every((c) => shared.flags.includes(c.flag) === c.on);
}

/** The tap areas of the current scene that can be tapped now. */
export function activeSpots(data: EscapeRoomData, progress: Progress): Spot[] {
  const scene = data.scenes.find((s) => s.id === progress.scene);
  return scene ? scene.spots.filter((spot) => conditionsHold(spot.when, progress.shared)) : [];
}

/**
 * Whether a puzzle or lock can be open now: some active tap area in any scene opens it. Any scene, because in a group
 * another player may stand elsewhere; the room's switches decide.
 */
function canOpen(data: EscapeRoomData, shared: Shared, kind: "puzzle" | "lock", target: string): boolean {
  const opens = (e: Effect) => (kind === "puzzle" ? e.do === "puzzle" && e.puzzle === target : e.do === "lock" && e.lock === target);
  return data.scenes.some((scene) => scene.spots.some((spot) => conditionsHold(spot.when, shared) && spot.action.some(opens)));
}

function runEffects(data: EscapeRoomData, progress: Progress, list: readonly Effect[]): { progress: Progress; open: Opening | null } {
  let { scene, shared } = progress;
  let open: Opening | null = null;
  for (const effect of list) {
    switch (effect.do) {
      case "puzzle":
        open = { kind: "puzzle", puzzle: effect.puzzle }; // also when solved: the result can be seen again
        break;
      case "lock": {
        if (!shared.opened.includes(effect.lock)) {
          open = { kind: "lock", lock: effect.lock };
          break;
        }
        // An open lock does what it did when it opened, e.g. the open door leads on.
        const lock = data.locks.find((l) => l.id === effect.lock);
        const after = runEffects(data, { scene, shared }, lock?.onOpen ?? []);
        ({ scene, shared } = after.progress);
        open = after.open ?? open;
        break;
      }
      case "view":
        open = { kind: "view", view: effect.view };
        break;
      case "go":
        scene = effect.scene;
        break;
      case "flag":
        shared = { ...shared, flags: added(shared.flags, effect.flag) };
        break;
      case "win":
        shared = shared.won ? shared : { ...shared, won: true };
        break;
    }
  }
  return { progress: { scene, shared }, open };
}

/** Applies one event. Pure; the room is assumed to be loaded (`loadEscapeRoom`). */
export function applyEvent(data: EscapeRoomData, progress: Progress, event: RoomEvent): Step {
  const refused: Step = { progress, open: null, accepted: false };
  switch (event.kind) {
    case "spot": {
      const spot = activeSpots(data, progress).find((s) => s.id === event.spot);
      if (!spot) return refused;
      return { ...runEffects(data, progress, spot.action), accepted: true };
    }
    case "solved": {
      const puzzle = data.puzzles.find((p) => p.id === event.puzzle);
      if (!puzzle || !canOpen(data, progress.shared, "puzzle", puzzle.id)) return refused;
      const shared = { ...progress.shared, solved: added(progress.shared.solved, puzzle.id) };
      return { ...runEffects(data, { ...progress, shared }, puzzle.onSolve), accepted: true };
    }
    case "code": {
      const lock = data.locks.find((l) => l.id === event.lock);
      if (!lock || !canOpen(data, progress.shared, "lock", lock.id) || !codeMatches(event.code, lock.code)) return refused;
      const shared = { ...progress.shared, opened: added(progress.shared.opened, lock.id) };
      return { ...runEffects(data, { ...progress, shared }, lock.onOpen), accepted: true };
    }
  }
}
