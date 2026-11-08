import { test } from "node:test";
import assert from "node:assert/strict";
import { mix } from "../core/puzzle-theme.ts";
import type { PuzzleTheme } from "../core/puzzle-theme.ts";
import { paletteCss, paletteRoles, paletteStyle } from "./palette.ts";
import type { Palette } from "./palette.ts";

const PALETTE: Palette = {
  scope: ".xx",
  vars: {
    "--xx-board": { light: "#eeeeee", dark: "#222222", theme: "board" },
    "--xx-edge": { light: "#cccccc", dark: "#444444", theme: (c) => mix(c.piece, "#000000", 0.5) },
  },
};

const THEME: PuzzleTheme = {
  colors: {
    board: "#ffffff", line: "#dddddd", wall: "#555555", figure: "#000000",
    piece: "#666666", accent: "#666666", target: "#222222", done: "#777777",
  },
};

test("paletteCss writes the light defaults and the dark ones for both ways of choosing dark mode", () => {
  const css = paletteCss(PALETTE);
  assert.match(css, /^\.xx \{ --xx-board: #eeeeee; --xx-edge: #cccccc; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \.xx \{ --xx-board: #222222; --xx-edge: #444444; \}/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme\]\) \.xx \{ --xx-board: #222222;/);
});

test("paletteStyle takes roles and derived colors from the theme, nothing without one", () => {
  assert.equal(paletteStyle(PALETTE, THEME), "--xx-board: #ffffff; --xx-edge: #333333;");
  assert.equal(paletteStyle(PALETTE, THEME), paletteStyle(PALETTE, THEME));
  assert.equal(paletteStyle(PALETTE, undefined), "");
});

test("paletteRoles lists the roles used directly and in derived colors", () => {
  assert.deepEqual(paletteRoles(PALETTE), ["board", "piece"]);
});
