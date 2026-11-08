import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_LIMITS,
  contrast,
  contrastProblems,
  detailOn,
  isDark,
  luminance,
  mix,
  parseHex,
  parseTheme,
  sameColors,
  sameTheme,
} from "./puzzle-theme.ts";
import type { PuzzleTheme, ThemeColors } from "./puzzle-theme.ts";

const COLORS: ThemeColors = {
  board: "#ffffff", line: "#dddddd", wall: "#555555", figure: "#000000",
  piece: "#333333", accent: "#666666", target: "#222222", done: "#777777",
};

test("parseTheme keeps a valid theme and lowercases its colors", () => {
  const theme = parseTheme({ colors: { ...COLORS, board: "#ABCDEF" } });
  assert.deepEqual(theme, { colors: { ...COLORS, board: "#abcdef" } });
});

test("parseTheme drops unknown roles and fields", () => {
  const theme = parseTheme({ name: "x", sounds: { win: "fanfare" }, colors: { ...COLORS, glow: "#123456" } });
  assert.deepEqual(theme, { colors: COLORS });
});

test("parseTheme rejects missing roles, bad colors and oversized themes", () => {
  const { done: _done, ...missing } = COLORS;
  for (const raw of [
    null,
    "night",
    [],
    { colors: [] },
    { colors: missing },
    { colors: { ...COLORS, piece: "red" } },
    { colors: { ...COLORS, piece: "#12345" } },
    { colors: { ...COLORS, piece: "#1234567" } },
    { colors: { ...COLORS, piece: "#12345g" } },
    { colors: { ...COLORS, piece: 0x123456 } },
    { colors: COLORS, note: "x".repeat(THEME_LIMITS.maxBytes) },
    { colors: { ...COLORS, ...Object.fromEntries(Array.from({ length: THEME_LIMITS.maxColorKeys }, (_, i) => [`r${i}`, "#000000"])) } },
  ]) {
    assert.equal(parseTheme(raw), null, JSON.stringify(raw)?.slice(0, 80));
  }
});

test("parseTheme keeps catalog icons and drops unknown roles and ids one by one", () => {
  const theme = parseTheme({ colors: COLORS, icons: { figure: "cat", box: "unicorn", wings: "star", goal: "flag" } });
  assert.deepEqual(theme, { colors: COLORS, icons: { figure: "cat", goal: "flag" } });
  assert.deepEqual(parseTheme({ colors: COLORS, icons: { figure: "unicorn" } }), { colors: COLORS });
  assert.deepEqual(parseTheme({ colors: COLORS, icons: "cat" }), { colors: COLORS });
});

test("sameColors ignores icons, sameTheme does not", () => {
  const plain: PuzzleTheme = { colors: COLORS };
  const cat: PuzzleTheme = { colors: COLORS, icons: { figure: "cat" } };
  assert.ok(sameColors(plain, cat));
  assert.ok(!sameTheme(plain, cat));
  assert.ok(sameTheme(cat, { colors: { ...COLORS }, icons: { figure: "cat" } }));
});

test("sameTheme compares colors", () => {
  const a: PuzzleTheme = { colors: COLORS };
  assert.ok(sameTheme(a, { colors: { ...COLORS } }));
  assert.ok(!sameTheme(a, { colors: { ...COLORS, done: "#000000" } }));
  assert.ok(!sameTheme(a, undefined));
  assert.ok(sameTheme(undefined, undefined));
});

test("color helpers: parse, mix, luminance, contrast", () => {
  assert.deepEqual(parseHex("#ff8000"), [255, 128, 0]);
  assert.throws(() => parseHex("ff8000"));
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#102030", "#102030", 0.3), "#102030");
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#ffffff"), 1);
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#000000"), 21);
  // Known WCAG value: #777777 on white is about 4.48.
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01);
  assert.ok(isDark("#1b2338") && !isDark("#e3efcf"));
  assert.ok(contrast(detailOn("#1d3557"), "#1d3557") > 4.5);
  assert.ok(contrast(detailOn("#e9f1fb"), "#e9f1fb") > 4.5);
});

test("contrastProblems checks only the pairs of roles the type has", () => {
  const theme: PuzzleTheme = { colors: { ...COLORS, piece: "#f4f4f4" } };
  assert.deepEqual(
    contrastProblems(theme, { roles: ["board", "piece"] }).map((p) => `${p.a}/${p.b}`),
    ["piece/board"],
  );
  assert.deepEqual(contrastProblems(theme, { roles: ["board", "wall"] }), []);
  // done next to piece needs less than parts on the board.
  const close: PuzzleTheme = { colors: { ...COLORS, piece: "#444444", done: "#4a4a4a" } };
  assert.deepEqual(contrastProblems(close, { roles: ["board", "piece", "done"] }).map((p) => `${p.a}/${p.b}`), ["done/piece"]);
});

test("fixed colors use the variant for the board's brightness", () => {
  const red = { light: "#e3342f", dark: "#ff5a50" };
  assert.deepEqual(contrastProblems({ colors: COLORS }, { roles: ["board"], fixed: [red] }), []);
  const redBoard: PuzzleTheme = { colors: { ...COLORS, board: "#e3342f" } };
  assert.deepEqual(contrastProblems(redBoard, { roles: ["board"], fixed: [red] }).map((p) => p.b), ["fixed"]);
});
