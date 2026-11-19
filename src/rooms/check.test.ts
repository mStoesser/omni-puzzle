import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesRegistry } from "../puzzles/rules.ts";
import { checkEscapeRoom } from "./check.ts";
import { escapeRoomExamples } from "./examples.ts";
import { loadEscapeRoom } from "./logic.ts";

const example = () => structuredClone(escapeRoomExamples[0]!.doc) as any;
const check = (change: (doc: any) => void = () => {}) => {
  const doc = example();
  change(doc);
  return checkEscapeRoom(loadEscapeRoom(doc, rulesRegistry).data);
};
const codes = (result: ReturnType<typeof check>) => result.problems.map((p) => (p.id ? `${p.code}:${p.id}` : p.code));

test("the example can be won without problems", () => {
  const result = check();
  assert.equal(result.status, "winnable");
  assert.equal(result.steps, 4); // safe (code), door, box (puzzle), exit; the lights only tell the code
  assert.equal(result.deadEnds, 0);
  assert.deepEqual(result.problems, []);
});

test("no victory at all, or none that can be reached", () => {
  const none = check((d) => (d.data.scenes[1].spots[3].action = [{ do: "view", view: "key" }]));
  assert.equal(none.status, "unwinnable");
  assert.ok(codes(none).includes("no-win"));
  assert.ok(codes(none).includes("unwinnable"));
  // The puzzle that turns on the switch for the exit never opens: its tap area needs that very switch.
  const locked = check((d) => (d.data.scenes[1].spots[1].when = [{ flag: "box-open", on: true }]));
  assert.equal(locked.status, "unwinnable");
  assert.equal(locked.steps, null);
  assert.ok(codes(locked).includes("puzzle-unreachable:parking"));
  assert.ok(codes(locked).includes("spot-unreachable:hall/box"));
  assert.ok(codes(locked).includes("spot-unreachable:hall/exit"));
  assert.ok(codes(locked).includes("flag-unused:box-open"));
});

test("dead ends: a switch hides an area that is still needed", () => {
  // The painting turns on "box-open"? No: it turns on a new switch that hides the box for good.
  const result = check((d) => {
    d.data.flags.push({ id: "dust", name: "Staub" });
    d.data.scenes[0].spots[1].action = [{ do: "flag", flag: "dust" }, { do: "view", view: "painting" }];
    d.data.scenes[1].spots[1].when = [{ flag: "dust", on: false }];
  });
  assert.equal(result.status, "winnable");
  assert.ok((result.deadEnds ?? 0) > 0);
  assert.ok(codes(result).includes("dead-end"));
});

test("unreachable scenes, locks and views", () => {
  const result = check((d) => {
    d.data.scenes.push({ id: "cellar", name: "Keller", image: { builtin: "cellar" }, hints: [], spots: [{ id: "x", label: "Regal", rect: { x: 0, y: 0, w: 20, h: 20 }, when: [], action: [{ do: "lock", lock: "shelf" }] }] });
    d.data.locks.push({ id: "shelf", name: "Regal", code: "3 1 4", onOpen: [] });
    d.data.views.push({ id: "note", name: "Zettel", text: "Nichts." });
  });
  assert.deepEqual(codes(result).sort(), ["lock-unreachable:shelf", "scene-unreachable:cellar", "view-unreachable:note"]);
});

test("unverified puzzles and codes that appear nowhere", () => {
  const result = check((d) => {
    delete d.data.puzzles[1].doc.meta.verified;
    d.data.puzzles[0].doc.meta.result = "Drei, eins, vier";
  });
  assert.deepEqual(codes(result).sort(), ["lock-code-hidden:safe", "puzzle-not-verified:parking"]);
  // A code in a hint counts as findable.
  const hinted = check((d) => {
    delete d.data.puzzles[0].doc.meta.result;
    d.data.scenes[0].hints.push("Der Code ist 314.");
  });
  assert.deepEqual(hinted.problems, []);
});

test("too many states for the exact search: the reduced one still knows winning and reachability", () => {
  // 12 switches that can be turned on in any order: 2 scenes × 2^12 × the safe and box states exceed the limit.
  const result = check((d) => {
    for (let i = 0; i < 12; i++) {
      d.data.flags.push({ id: `f${i}`, name: `S${i}` });
      d.data.scenes[0].spots.push({ id: `s${i}`, label: `S${i}`, rect: { x: (i % 6) * 15, y: i < 6 ? 0 : 10, w: 6, h: 10 }, when: [], action: [{ do: "flag", flag: `f${i}` }] });
    }
    d.data.scenes[1].spots[3].when.push({ flag: "f11", on: true }); // the exit needs the last one too
  });
  assert.equal(result.status, "winnable");
  assert.equal(result.steps, null);
  assert.equal(result.deadEnds, null);
  assert.deepEqual(result.problems, []);
});

test("the reduced search still finds unwinnable rooms and branches on switches that hide something", () => {
  const many = (d: any) => {
    for (let i = 0; i < 12; i++) {
      d.data.flags.push({ id: `f${i}`, name: `S${i}` });
      d.data.scenes[0].spots.push({ id: `s${i}`, label: `S${i}`, rect: { x: (i % 6) * 15, y: i < 6 ? 0 : 10, w: 6, h: 10 }, when: [], action: [{ do: "flag", flag: `f${i}` }] });
    }
  };
  const unwinnable = check((d) => {
    many(d);
    d.data.scenes[1].spots[1].when = [{ flag: "box-open", on: true }];
  });
  assert.equal(unwinnable.status, "unwinnable");
  assert.ok(codes(unwinnable).includes("spot-unreachable:hall/exit"));
  // f0 hides the safe; taking it at once would make the room look unwinnable, so it must branch.
  const risky = check((d) => {
    many(d);
    d.data.scenes[0].spots[2].when = [{ flag: "f0", on: false }];
  });
  assert.equal(risky.status, "winnable");
});

test("the search stops at a limit and then claims nothing about reachability", () => {
  const doc = loadEscapeRoom(example(), rulesRegistry);
  const result = checkEscapeRoom(doc.data, { maxStates: 2 });
  assert.equal(result.status, "aborted");
  assert.deepEqual(result.problems, [{ code: "aborted" }]);
});
