import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesRegistry } from "../puzzles/rules.ts";
import { escapeRoomExamples } from "./examples.ts";
import { applyEvent, loadEscapeRoom } from "./logic.ts";
import { newRoomSave, parseRoomSave, roomSaveKey, roomStarted } from "./save.ts";

const doc = loadEscapeRoom(escapeRoomExamples[0]!.doc, rulesRegistry);
const data = doc.data;

test("a new save starts in the first scene; without an intro it counts as seen", () => {
  const save = newRoomSave(data, 1000);
  assert.deepEqual(save.progress.scene, "study");
  assert.equal(save.introSeen, false);
  assert.equal(newRoomSave({ ...data, intro: undefined } as typeof data, 0).introSeen, true);
  assert.equal(roomStarted(save, data), false);
});

test("a save survives the round trip through storage (JSON) and is checked against the room", () => {
  const step = applyEvent(data, newRoomSave(data, 0).progress, { kind: "code", lock: "safe", code: "314" });
  const save = { ...newRoomSave(data, 5), progress: step.progress, hints: { study: 1 }, introSeen: true };
  const back = parseRoomSave(JSON.parse(JSON.stringify(save)), data);
  assert.deepEqual(back, save);
  assert.equal(roomStarted(back!, data), true);
});

test("saves that do not fit the room are dropped", () => {
  const good = JSON.parse(JSON.stringify(newRoomSave(data, 0)));
  const bad = (change: (s: any) => void) => {
    const s = structuredClone(good);
    change(s);
    assert.equal(parseRoomSave(s, data), null);
  };
  bad((s) => (s.progress.scene = "cellar"));
  bad((s) => (s.progress.shared.flags = ["nope"]));
  bad((s) => (s.progress.shared.solved = [1]));
  bad((s) => (s.progress.shared.won = true)); // won without a time
  bad((s) => (s.startedAt = "yesterday"));
  bad((s) => delete s.hints);
  assert.equal(parseRoomSave(null, data), null);
});

test("hints are capped at what the scene has; unknown scenes are dropped", () => {
  const raw = { ...JSON.parse(JSON.stringify(newRoomSave(data, 0))), hints: { study: 9, hall: 0, cellar: 2 } };
  assert.deepEqual(parseRoomSave(raw, data)?.hints, { study: 2 });
});

test("the key depends on the content, not on the title", () => {
  const renamed = { ...doc, meta: { ...doc.meta, title: "Anders" } };
  assert.equal(roomSaveKey(renamed), roomSaveKey(doc));
  assert.notEqual(roomSaveKey(loadEscapeRoom(escapeRoomExamples[1]!.doc, rulesRegistry)), roomSaveKey(doc)); // other texts
  assert.match(roomSaveKey(doc), /^room:[0-9a-f]{64}$/);
});
