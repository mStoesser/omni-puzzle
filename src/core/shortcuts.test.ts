import { test } from "node:test";
import assert from "node:assert/strict";
import { ariaShortcut, keysStayInTarget, shortcutFor, shortcutHint, shortcutRows } from "./shortcuts.ts";
import type { KeyInput } from "./shortcuts.ts";

const press = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("Ctrl Z undoes, Ctrl Y and Ctrl Shift Z redo, in every context", () => {
  for (const context of ["play", "editor", "test"] as const) {
    assert.deepEqual(shortcutFor(press("z", { ctrlKey: true }), context, false), { action: "undo" });
    assert.deepEqual(shortcutFor(press("Z", { ctrlKey: true, shiftKey: true }), context, false), { action: "redo" });
    assert.deepEqual(shortcutFor(press("y", { ctrlKey: true }), context, false), { action: "redo" });
  }
  assert.equal(shortcutFor(press("Y", { ctrlKey: true, shiftKey: true }), "play", false), null);
});

test("on a Mac Cmd is the modifier, and Ctrl Z does nothing", () => {
  assert.deepEqual(shortcutFor(press("z", { metaKey: true }), "play", true), { action: "undo" });
  assert.deepEqual(shortcutFor(press("z", { metaKey: true, shiftKey: true }), "play", true), { action: "redo" });
  assert.equal(shortcutFor(press("z", { ctrlKey: true }), "play", true), null);
  assert.equal(shortcutFor(press("z", { metaKey: true }), "play", false), null);
});

test("Alt (AltGr) and other modifiers never trigger a shortcut", () => {
  assert.equal(shortcutFor(press("z", { ctrlKey: true, altKey: true }), "play", false), null);
  assert.equal(shortcutFor(press("r", { altKey: true }), "play", false), null);
  assert.equal(shortcutFor(press("r", { ctrlKey: true }), "play", false), null); // Ctrl R reloads the page
  assert.equal(shortcutFor(press("1", { ctrlKey: true }), "editor", false), null);
});

test("R restarts while playing, P switches between building and test play", () => {
  assert.deepEqual(shortcutFor(press("r"), "play", false), { action: "restart" });
  assert.deepEqual(shortcutFor(press("R", { shiftKey: false }), "test", false), { action: "restart" });
  assert.equal(shortcutFor(press("r"), "editor", false), null);
  assert.equal(shortcutFor(press("R", { shiftKey: true }), "play", false), null);
  assert.deepEqual(shortcutFor(press("p"), "editor", false), { action: "mode" });
  assert.deepEqual(shortcutFor(press("p"), "test", false), { action: "mode" });
  assert.equal(shortcutFor(press("p"), "play", false), null);
});

test("digits select tools in the editor: 1–9, 0 for the tenth", () => {
  assert.deepEqual(shortcutFor(press("1"), "editor", false), { action: "tool", index: 0 });
  assert.deepEqual(shortcutFor(press("9"), "editor", false), { action: "tool", index: 8 });
  assert.deepEqual(shortcutFor(press("0"), "editor", false), { action: "tool", index: 9 });
  assert.equal(shortcutFor(press("1"), "play", false), null);
  assert.equal(shortcutFor(press("1"), "test", false), null);
});

test("? opens the overview, whatever Shift does on the layout", () => {
  assert.deepEqual(shortcutFor(press("?", { shiftKey: true }), "play", false), { action: "help" });
  assert.deepEqual(shortcutFor(press("?"), "editor", true), { action: "help" });
  assert.equal(shortcutFor(press("?", { ctrlKey: true }), "play", false), null);
});

test("moves stay with the puzzle: arrows and WASD are no shortcuts", () => {
  for (const key of ["ArrowUp", "w", "a", "s", "d", "Enter", " "]) assert.equal(shortcutFor(press(key), "play", false), null, key);
});

test("keys stay in text fields, selects and editable content, not in radios or buttons", () => {
  assert.equal(keysStayInTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(keysStayInTarget({ tagName: "input" }), true); // type defaults to text
  assert.equal(keysStayInTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(keysStayInTarget({ tagName: "SELECT" }), true);
  assert.equal(keysStayInTarget({ tagName: "DIV", isContentEditable: true }), true);
  for (const type of ["radio", "checkbox", "color", "button"]) assert.equal(keysStayInTarget({ tagName: "INPUT", type }), false, type);
  assert.equal(keysStayInTarget({ tagName: "BUTTON" }), false);
  assert.equal(keysStayInTarget(null), false);
});

test("the overview lists what works in each context", () => {
  const labels = (rows: ReturnType<typeof shortcutRows>) => rows.map((r) => r.label);
  assert.deepEqual(labels(shortcutRows("play", false, "Strg")), ["undo", "redo", "restart", "shortcutsMove", "shortcutsHelp"]);
  assert.deepEqual(labels(shortcutRows("play", false, "Strg", false)), ["restart", "shortcutsMove", "shortcutsHelp"]); // quiz
  assert.deepEqual(labels(shortcutRows("editor", false, "Strg")), ["undo", "redo", "shortcutsTool", "testPlay", "shortcutsHelp"]);
  assert.deepEqual(labels(shortcutRows("test", false, "Strg")), ["undo", "redo", "restart", "shortcutsMove", "shortcutsBuild", "shortcutsHelp"]);
  assert.deepEqual(shortcutRows("play", false, "Strg")[0]!.combos, [["Strg", "Z"]]);
  assert.deepEqual(shortcutRows("play", true, "Strg")[1]!.combos, [["⌘", "⇧", "Z"]]);
});

test("buttons name their shortcut for screen readers and tooltips", () => {
  assert.equal(ariaShortcut("undo", false), "Control+Z");
  assert.equal(ariaShortcut("redo", false), "Control+Y Control+Shift+Z");
  assert.equal(ariaShortcut("redo", true), "Meta+Shift+Z");
  assert.equal(ariaShortcut("restart", false), "R");
  assert.equal(shortcutHint("undo", false, "Strg"), "Strg+Z");
  assert.equal(shortcutHint("redo", true, "Strg"), "⌘⇧Z");
});
