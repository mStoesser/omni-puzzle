import type { MessageKey } from "../i18n/t.ts";
import type { PuzzleTheme } from "./puzzle-theme.ts";

/**
 * Ready-made puzzle themes (M29). Each one passes the contrast check for every type (see theme-presets.test.ts).
 * A puzzle stores the colors, not the id, so changing a preset here does not change existing puzzles;
 * the editor recognizes a preset by its colors. Icons (M31) suit the theme; each type shows only its icon roles.
 */
export type ThemePreset = { id: string; name: MessageKey; theme: PuzzleTheme };

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "garden",
    name: "puzzleThemeGarden",
    theme: {
      colors: {
        board: "#e3efcf", line: "#c5d9aa", wall: "#6d5843", figure: "#22311a",
        piece: "#b86e34", accent: "#4f7a28", target: "#b0236a", done: "#2f6d1e",
      },
      icons: { figure: "cat", box: "apple", goal: "flower", rock: "tree", lamp: "sun" },
    },
  },
  {
    id: "ocean",
    name: "puzzleThemeOcean",
    theme: {
      colors: {
        board: "#cfe8ec", line: "#a9d1d8", wall: "#4d6470", figure: "#0f2a3a",
        piece: "#c25a2c", accent: "#1f6f8b", target: "#a3186b", done: "#0f4d36",
      },
      icons: { figure: "penguin", box: "barrel", goal: "flag", rock: "rock", lamp: "star" },
    },
  },
  {
    id: "pastel",
    name: "puzzleThemePastel",
    theme: {
      colors: {
        board: "#fbf3ea", line: "#ead9c8", wall: "#8a7a8f", figure: "#3d3557",
        piece: "#c0577a", accent: "#4f7fa6", target: "#9a5a00", done: "#1f5446",
      },
      icons: { figure: "cat", box: "gift", goal: "flower", rock: "cactus", lamp: "sun" },
    },
  },
  {
    id: "night",
    name: "puzzleThemeNight",
    theme: {
      colors: {
        board: "#1b2338", line: "#2c3753", wall: "#7a86a3", figure: "#f3e9c6",
        piece: "#6f9bd8", accent: "#a98bd9", target: "#ffd166", done: "#7ee0b0",
      },
      icons: { figure: "ghost", box: "gift", goal: "star", rock: "rock", lamp: "moon" },
    },
  },
  {
    id: "space",
    name: "puzzleThemeSpace",
    theme: {
      colors: {
        board: "#0d0a1f", line: "#241d45", wall: "#6e6890", figure: "#e8f4ff",
        piece: "#c56cf0", accent: "#3a9fd6", target: "#ff6b9d", done: "#7cfc9a",
      },
      icons: { figure: "robot", box: "star", goal: "flag", rock: "rock", lamp: "star" },
    },
  },
];
