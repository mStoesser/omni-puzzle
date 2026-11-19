import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentError } from "../core/document.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { escapeRoomExamples } from "./examples.ts";
import { activeSpots, applyEvent, codeMatches, EMPTY_SHARED, loadEscapeRoom, mergeShared, normalizeCode, startProgress } from "./logic.ts";
import type { EscapeRoomData, Progress, Shared } from "./logic.ts";

const example = () => structuredClone(escapeRoomExamples[0]!.doc) as any;
const load = (raw: unknown) => loadEscapeRoom(raw, rulesRegistry);
const invalid = (change: (doc: any) => void, code: DocumentError["code"] = "invalid") => {
  const doc = example();
  change(doc);
  assert.throws(() => load(doc), (e) => e instanceof DocumentError && e.code === code);
};

test("the example loads, and unknown fields are dropped", () => {
  const raw = example();
  raw.extra = 1;
  raw.meta.evil = "x";
  raw.data.scenes[0].secret = true;
  raw.data.scenes[0].spots[0].more = 1;
  const doc = load(raw);
  assert.equal(doc.meta.title, "Das Arbeitszimmer");
  assert.equal("extra" in doc, false);
  assert.equal("evil" in doc.meta, false);
  assert.equal("secret" in doc.data.scenes[0]!, false);
  assert.equal("more" in doc.data.scenes[0]!.spots[0]!, false);
  assert.equal(doc.data.puzzles[0]!.doc.meta.result, "3 1 4");
  assert.deepEqual(doc.data.scenes, example().data.scenes);
});

test("format, kind and version", () => {
  invalid((d) => (d.format = 2), "unsupported");
  invalid((d) => (d.format = "1"));
  invalid((d) => (d.kind = "puzzle"));
  invalid((d) => (d.version = 0));
  invalid((d) => (d.version = 2), "unsupported");
  invalid((d) => (d.data.intro = "x".repeat(600_000)), "too-large");
});

test("every reference must exist, ids must be valid and unique", () => {
  invalid((d) => (d.data.start = "cellar"));
  invalid((d) => (d.data.scenes[0].spots[4].action = [{ do: "go", scene: "cellar" }]));
  invalid((d) => (d.data.scenes[0].spots[0].action = [{ do: "puzzle", puzzle: "nope" }]));
  invalid((d) => (d.data.scenes[0].spots[3].when = [{ flag: "nope", on: true }]));
  invalid((d) => (d.data.locks[0].onOpen = [{ do: "flag", flag: "nope" }]));
  invalid((d) => (d.data.scenes[1].id = "study"));
  invalid((d) => (d.data.scenes[0].spots[1].id = "desk"));
  invalid((d) => (d.data.views[0].id = "Bild"));
  invalid((d) => (d.data.scenes = []));
});

test("effects: one opening per list, none that opens puzzles or locks after solving or opening", () => {
  invalid((d) => (d.data.scenes[0].spots[0].action = [{ do: "puzzle", puzzle: "lights" }, { do: "view", view: "painting" }]));
  invalid((d) => (d.data.puzzles[0].onSolve = [{ do: "lock", lock: "safe" }]));
  invalid((d) => (d.data.locks[0].onOpen = [{ do: "puzzle", puzzle: "lights" }]));
  invalid((d) => (d.data.scenes[0].spots[0].action = []));
  invalid((d) => (d.data.scenes[0].spots[0].action = [{ do: "dance" }]));
  invalid((d) => (d.data.scenes[0].spots[0].action = Array(9).fill({ do: "flag", flag: "safe-open" })));
  // Views and immediate effects are fine after a puzzle or a lock.
  const doc = example();
  doc.data.puzzles[0].onSolve = [{ do: "flag", flag: "safe-open" }, { do: "go", scene: "hall" }, { do: "view", view: "key" }, { do: "win" }];
  assert.doesNotThrow(() => load(doc));
});

test("tap areas: inside the picture and at least MIN_SPOT large", () => {
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: 95, y: 0, w: 10, h: 10 }));
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: 0, y: 0, w: 4, h: 20 }));
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: 0, y: 0, w: 20, h: 8 }));
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: -1, y: 0, w: 20, h: 20 }));
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: 0, y: 0, w: "20", h: 20 }));
  invalid((d) => (d.data.scenes[0].spots[0].rect = { x: 0, y: 0, w: Infinity, h: 20 }));
});

test("texts, pictures, views and codes", () => {
  invalid((d) => (d.data.scenes[0].name = "  "));
  invalid((d) => (d.data.scenes[0].image = { key: "abc" }));
  invalid((d) => (d.data.scenes[0].image = { builtin: "castle" })); // not shipped with the app
  invalid((d) => (d.data.scenes[0].image = { builtin: "study", key: "a".repeat(64) }));
  invalid((d) => (d.data.views[0] = { id: "painting", name: "Bild" }));
  invalid((d) => (d.data.locks[0].code = " "));
  invalid((d) => (d.data.locks[0].code = "x".repeat(41)));
  invalid((d) => (d.data.scenes[0].hints = Array(6).fill("Tipp")));
  const doc = example();
  doc.data.scenes[0].image = { key: "a".repeat(64) };
  doc.data.views[0] = { id: "painting", name: " Bild ", image: { builtin: "hall" }, text: "  " };
  const loaded = load(doc);
  assert.deepEqual(loaded.data.views[0], { id: "painting", name: "Bild", image: { builtin: "hall" } });
});

test("an embedded puzzle is checked like a puzzle document, with its path in the error", () => {
  const doc = example();
  doc.data.puzzles[1].doc.data = { broken: true };
  assert.throws(() => load(doc), (e) => e instanceof DocumentError && e.message.startsWith("puzzles.1.doc"));
  invalid((d) => (d.data.puzzles[0].doc.type = "unknown"), "unknown-type");
});

test("codes ignore spaces and case", () => {
  assert.equal(normalizeCode(" ab 1 2\n"), "AB12");
  assert.ok(codeMatches("3 1 4", "314"));
  assert.ok(codeMatches("rot", "ROT"));
  assert.ok(!codeMatches("315", "314"));
});

const data = (): EscapeRoomData => load(example()).data;

test("playing the example: taps, a lock, a door that opens later, a puzzle that turns on a switch, the victory", () => {
  const room = data();
  let p: Progress = startProgress(room);
  assert.equal(p.scene, "study");
  assert.deepEqual(activeSpots(room, p).map((s) => s.id), ["desk", "painting", "safe", "door-locked"]);

  let step = applyEvent(room, p, { kind: "spot", spot: "desk" });
  assert.deepEqual(step.open, { kind: "puzzle", puzzle: "lights" });
  step = applyEvent(room, p, { kind: "spot", spot: "door" });
  assert.equal(step.accepted, false); // not there yet
  step = applyEvent(room, p, { kind: "spot", spot: "door-locked" });
  assert.deepEqual(step.open, { kind: "view", view: "door-locked" });

  step = applyEvent(room, p, { kind: "spot", spot: "safe" });
  assert.deepEqual(step.open, { kind: "lock", lock: "safe" });
  assert.equal(applyEvent(room, p, { kind: "code", lock: "safe", code: "315" }).accepted, false);
  step = applyEvent(room, p, { kind: "code", lock: "safe", code: "3 1 4" });
  assert.deepEqual(step.open, { kind: "view", view: "safe-open" });
  p = step.progress;
  assert.deepEqual(p.shared, { flags: ["safe-open"], solved: [], opened: ["safe"], won: false });

  // The open safe does what it did when it opened (no code again).
  assert.deepEqual(applyEvent(room, p, { kind: "spot", spot: "safe" }).open, { kind: "view", view: "safe-open" });
  assert.deepEqual(activeSpots(room, p).map((s) => s.id), ["desk", "painting", "safe", "door"]);
  p = applyEvent(room, p, { kind: "spot", spot: "door" }).progress;
  assert.equal(p.scene, "hall");
  assert.equal(applyEvent(room, p, { kind: "spot", spot: "desk" }).accepted, false); // in another scene

  step = applyEvent(room, p, { kind: "solved", puzzle: "parking" });
  assert.deepEqual(step.open, { kind: "view", view: "key" });
  p = step.progress;
  assert.deepEqual(p.shared.solved, ["parking"]);
  p = applyEvent(room, p, { kind: "spot", spot: "exit" }).progress;
  assert.equal(p.shared.won, true);
});

test("a puzzle or lock counts only while some tap area can open it", () => {
  const room = data();
  const p = startProgress(room);
  // The lights puzzle is on the desk, active from the start; in a group someone else may solve it from anywhere.
  assert.equal(applyEvent(room, { ...p, scene: "hall" }, { kind: "solved", puzzle: "lights" }).accepted, true);
  const hidden = data();
  (hidden.scenes[0]!.spots[0] as any).when = [{ flag: "box-open", on: true }];
  assert.equal(applyEvent(hidden, p, { kind: "solved", puzzle: "lights" }).accepted, false);
  assert.equal(applyEvent(room, p, { kind: "solved", puzzle: "nope" }).accepted, false);
  assert.equal(applyEvent(room, p, { kind: "code", lock: "nope", code: "1" }).accepted, false);
});

test("events never change the given progress", () => {
  const room = data();
  const p = startProgress(room);
  const frozen = structuredClone(p);
  applyEvent(room, p, { kind: "code", lock: "safe", code: "314" });
  applyEvent(room, p, { kind: "solved", puzzle: "parking" });
  assert.deepEqual(p, frozen);
  assert.equal(p.shared, EMPTY_SHARED);
});

test("shared progress merges without conflicts: commutative, associative, idempotent", () => {
  const a: Shared = { flags: ["a", "c"], solved: ["p1"], opened: [], won: false };
  const b: Shared = { flags: ["b", "c"], solved: [], opened: ["l1"], won: false };
  const c: Shared = { flags: [], solved: ["p2"], opened: ["l1"], won: true };
  assert.deepEqual(mergeShared(a, b), { flags: ["a", "b", "c"], solved: ["p1"], opened: ["l1"], won: false });
  assert.deepEqual(mergeShared(a, b), mergeShared(b, a));
  assert.deepEqual(mergeShared(mergeShared(a, b), c), mergeShared(a, mergeShared(b, c)));
  assert.deepEqual(mergeShared(a, a), a);
  assert.deepEqual(mergeShared(a, EMPTY_SHARED), a);
});

test("two players in a group: each one's events, merged, give the same as one player doing all", () => {
  const room = data();
  const start = startProgress(room);
  const alice = applyEvent(room, start, { kind: "code", lock: "safe", code: "314" }).progress;
  const bob = applyEvent(room, start, { kind: "solved", puzzle: "lights" }).progress;
  const together = mergeShared(alice.shared, bob.shared);
  const alone = applyEvent(room, alice, { kind: "solved", puzzle: "lights" }).progress.shared;
  assert.deepEqual(together, alone);
});
