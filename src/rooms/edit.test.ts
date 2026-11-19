import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentError } from "../core/document.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { lightsOutExamples } from "../puzzles/lightsout/examples.ts";
import * as edit from "./edit.ts";
import { escapeRoomExamples } from "./examples.ts";
import { loadEscapeRoom, MIN_SPOT } from "./logic.ts";
import type { EscapeRoomData } from "./logic.ts";

const example = (): EscapeRoomData => loadEscapeRoom(escapeRoomExamples[0]!.doc, rulesRegistry).data;
const strict = (data: EscapeRoomData) => loadEscapeRoom({ ...escapeRoomExamples[0]!.doc, data }, rulesRegistry);
const effectsOf = (data: EscapeRoomData) => JSON.stringify([data.scenes.map((s) => s.spots.map((p) => p.action)), data.puzzles.map((p) => p.onSolve), data.locks.map((l) => l.onOpen)]);

test("a new escape room is a valid draft with one empty scene", () => {
  const doc = edit.newEscapeRoom("Neu", "de", "2026-11-20T00:00:00.000Z", "Raum 1");
  assert.deepEqual(loadEscapeRoom(doc, rulesRegistry, { draft: true }), doc);
  assert.doesNotThrow(() => loadEscapeRoom(doc, rulesRegistry)); // nothing missing yet, just nothing to do
});

test("free ids", () => {
  assert.equal(edit.freeId("scene", []), "scene-1");
  assert.equal(edit.freeId("scene", ["scene-1", "scene-3"]), "scene-2");
});

test("rectangles stay inside the picture and at least MIN_SPOT large", () => {
  assert.deepEqual(edit.clampRect({ x: 98, y: -5, w: 1, h: 1 }), { x: 100 - MIN_SPOT.w, y: 0, w: MIN_SPOT.w, h: MIN_SPOT.h });
  assert.deepEqual(edit.clampRect({ x: 10.04, y: 20.06, w: 30.33, h: 40.77 }), { x: 10, y: 20.1, w: 30.3, h: 40.8 });
  assert.deepEqual(edit.rectBetween(60, 50, 20, 10), { x: 20, y: 10, w: 40, h: 40 });
  assert.deepEqual(edit.clampRect({ x: 0, y: 0, w: 150, h: 150 }), { x: 0, y: 0, w: 100, h: 100 });
});

test("scenes: add, rename, remove with the doors to it; the last one stays", () => {
  let data = example();
  const added = edit.addScene(data, "Keller", { builtin: "cellar" });
  assert.equal(added.id, "scene-1");
  data = edit.updateScene(added.data, "scene-1", { name: "Dunkler Keller" });
  assert.equal(data.scenes[2]!.name, "Dunkler Keller");
  data = edit.removeScene(data, "hall"); // the study door led there
  assert.deepEqual(data.scenes.map((s) => s.id), ["study", "scene-1"]);
  assert.deepEqual(data.scenes[0]!.spots.find((s) => s.id === "door")!.action, []);
  data = edit.removeScene(data, "study");
  assert.equal(data.start, "scene-1");
  assert.equal(edit.removeScene(data, "scene-1"), data);
});

test("spots: add (clamped), move, change, remove", () => {
  let data = example();
  const added = edit.addSpot(data, "hall", { x: 95, y: 95, w: 2, h: 2 }, "Lampe");
  assert.equal(added.id, "spot-1");
  data = added.data;
  const spot = () => data.scenes[1]!.spots.find((s) => s.id === "spot-1")!;
  assert.deepEqual(spot().rect, { x: 95, y: 91, w: 5, h: 9 });
  data = edit.updateSpot(data, "hall", "spot-1", { rect: { x: -10, y: 50, w: 20, h: 20 }, label: "Lampe an", action: [{ do: "win" }] });
  assert.deepEqual(spot().rect, { x: 0, y: 50, w: 20, h: 20 });
  assert.equal(spot().label, "Lampe an");
  data = edit.removeSpot(data, "hall", "spot-1");
  assert.equal(data.scenes[1]!.spots.some((s) => s.id === "spot-1"), false);
  assert.deepEqual(strict(data).data, strict(example()).data);
});

test("removing a switch removes its conditions and effects", () => {
  const data = edit.removeFlag(example(), "safe-open");
  assert.deepEqual(data.flags.map((f) => f.id), ["box-open"]);
  assert.ok(!effectsOf(data).includes('"flag":"safe-open"'));
  assert.ok(effectsOf(data).includes('"view":"safe-open"')); // the view of the same name stays
  assert.ok(data.scenes[0]!.spots.every((s) => s.when.every((c) => c.flag !== "safe-open")));
  assert.doesNotThrow(() => strict(data));
});

test("removing a lock, view or puzzle removes the effects that open it", () => {
  let data = edit.removeLock(example(), "safe");
  assert.deepEqual(data.scenes[0]!.spots.find((s) => s.id === "safe")!.action, []);
  data = edit.removeView(data, "key");
  assert.deepEqual(data.puzzles.find((p) => p.id === "parking")!.onSolve, [{ do: "flag", flag: "box-open" }]);
  data = edit.removePuzzle(data, "lights");
  assert.ok(!effectsOf(data).includes('"lights"'));
  assert.doesNotThrow(() => loadEscapeRoom({ ...escapeRoomExamples[0]!.doc, data }, rulesRegistry, { draft: true }));
});

test("puzzles: copied in, renamed, with a result and effects", () => {
  const source = lightsOutExamples[1]!.doc;
  let { data, id } = edit.addPuzzle(example(), source, "Noch ein Lichterspiel");
  assert.equal(id, "puzzle-1");
  data = edit.setPuzzleResult(data, id, "  4711 ");
  data = edit.setPuzzleEffects(edit.renamePuzzle(data, id, "Lampen"), id, [{ do: "win" }]);
  const puzzle = data.puzzles.find((p) => p.id === id)!;
  assert.equal(puzzle.name, "Lampen");
  assert.equal(puzzle.doc.meta.result, "4711");
  assert.deepEqual(puzzle.onSolve, [{ do: "win" }]);
  assert.equal(source.meta.result, undefined); // a copy
  data = edit.setPuzzleResult(data, id, " ");
  assert.equal("result" in data.puzzles.find((p) => p.id === id)!.doc.meta, false);
});

test("views: the picture and the text can be removed again", () => {
  let { data, id } = edit.addView(example(), "Zettel");
  data = edit.updateView(data, id, { image: { builtin: "lab" }, text: "Hallo" });
  data = edit.updateView(data, id, { image: undefined });
  assert.deepEqual(data.views.find((v) => v.id === id), { id, name: "Zettel", text: "Hallo" });
});

test("allowed effects: one opening per list, only views after solving or opening, at most 8", () => {
  assert.deepEqual(edit.allowedEffects([], true), ["puzzle", "lock", "view", "go", "flag", "win"]);
  assert.deepEqual(edit.allowedEffects([{ do: "flag", flag: "x" }], true), ["puzzle", "lock", "view", "go", "flag", "win"]);
  assert.deepEqual(edit.allowedEffects([{ do: "lock", lock: "x" }], true), ["go", "flag", "win"]);
  assert.deepEqual(edit.allowedEffects([], false), ["view", "go", "flag", "win"]);
  assert.deepEqual(edit.allowedEffects(Array(8).fill({ do: "win" }), true), []);
});

test("draft problems list what strict loading would refuse", () => {
  let data = example();
  assert.deepEqual(edit.draftProblems(data, rulesRegistry), []);
  data = edit.addSpot(data, "study", { x: 0, y: 0, w: 10, h: 10 }, " ").data;
  data = edit.addLock(data, "Truhe").data;
  data = edit.addView(data, "Leer").data;
  data = edit.addFlag(data, "").data;
  data = edit.updateScene(data, "hall", { hints: ["", "Tipp"] });
  const broken = structuredClone(lightsOutExamples[0]!.doc) as any;
  broken.data.rows = ["xx"];
  data = { ...data, puzzles: [...data.puzzles, { id: "bad", name: "Kaputt", doc: broken, onSolve: [] }] };
  assert.deepEqual(
    edit.draftProblems(data, rulesRegistry).map((p) => `${p.code}:${p.id}`),
    ["spot-label:study/spot-1", "spot-action:study/spot-1", "hint-empty:hall", "flag-name:flag-1", "lock-code:lock-1", "view-empty:view-1", "puzzle-invalid:bad"],
  );
  assert.throws(() => strict(data), DocumentError);
});

test("a draft with what is still missing loads in draft mode only", () => {
  let data = edit.addSpot(example(), "study", { x: 0, y: 0, w: 10, h: 10 }, "").data;
  data = edit.addLock(data, "").data;
  data = edit.addView(data, "Leer").data;
  const doc = { ...escapeRoomExamples[0]!.doc, data };
  assert.throws(() => loadEscapeRoom(doc, rulesRegistry), DocumentError);
  assert.deepEqual(loadEscapeRoom(doc, rulesRegistry, { draft: true }).data, data);
});

test("the pictures a room uses: scenes, views, and the puzzles' own", () => {
  let data = edit.updateScene(example(), "hall", { image: { key: "a".repeat(64) } });
  data = edit.updateView(edit.addView(data, "Foto").data, "view-1", { image: { key: "b".repeat(64) } });
  assert.deepEqual(edit.roomImageKeys(data, rulesRegistry).sort(), ["a".repeat(64), "b".repeat(64)]);
});
