// Puzzle themes (M29): colors of the board, chosen by the author per puzzle and stored in meta.theme.
// Not the app theme (light/dark, ui/theme.ts). Pure and DOM-free: the publish function checks themes too.

/**
 * Shared roles of all puzzle types. Each type maps its parts to the roles it has (PuzzleRules.themeRoles),
 * so one theme fits every type.
 */
export const THEME_ROLES = ["board", "line", "wall", "figure", "piece", "accent", "target", "done"] as const;
export type ThemeRole = (typeof THEME_ROLES)[number];

export type ThemeColors = Record<ThemeRole, string>;

/** A complete theme: a color per role, as lowercase "#rrggbb". */
export type PuzzleTheme = { colors: ThemeColors };

export const THEME_LIMITS = { maxBytes: 1024, maxColorKeys: 32 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks an untrusted theme (from a link, the gallery or a newer app version). Returns a clean copy, or null if it is
 * not a valid theme: then the puzzle is shown in the default colors. Every role needs a "#rrggbb" color; colors of
 * roles this version does not know are dropped, as are other fields.
 */
export function parseTheme(raw: unknown): PuzzleTheme | null {
  if (!isRecord(raw) || !isRecord(raw.colors)) return null;
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return null;
  }
  if (size > THEME_LIMITS.maxBytes || Object.keys(raw.colors).length > THEME_LIMITS.maxColorKeys) return null;
  const colors = {} as ThemeColors;
  for (const role of THEME_ROLES) {
    const color = raw.colors[role];
    if (typeof color !== "string" || !HEX.test(color)) return null;
    colors[role] = color.toLowerCase();
  }
  return { colors };
}

export function sameTheme(a: PuzzleTheme | undefined, b: PuzzleTheme | undefined): boolean {
  if (!a || !b) return a === b;
  return THEME_ROLES.every((role) => a.colors[role] === b.colors[role]);
}

// --- Colors ---

type Rgb = readonly [number, number, number];

/** "#rrggbb" → [r, g, b] in 0–255. */
export function parseHex(color: string): Rgb {
  if (!HEX.test(color)) throw new Error(`not a color: ${color}`);
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes `a` with `t` (0–1) of `b`, in sRGB like CSS color-mix(in srgb, …). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Relative luminance (WCAG 2). */
export function luminance(color: string): number {
  const [r, g, b] = parseHex(color).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio (WCAG 2), 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether white has more contrast on this color than black (a dark board). */
export function isDark(color: string): boolean {
  return contrast(color, "#ffffff") > contrast(color, "#000000");
}

/** A small detail drawn on top of `color` (e.g. a face on the figure): nearly white on dark colors, nearly black on light ones. */
export function detailOn(color: string): string {
  return mix(color, isDark(color) ? "#ffffff" : "#000000", 0.85);
}

// --- Contrast check ---

/**
 * Pairs that must be told apart, with their minimum contrast ratio. Only pairs of roles the type has are checked.
 * Parts on the board need 3:1 (WCAG for graphical objects). "done" next to "piece" (e.g. a box on its goal) needs
 * less, because those always differ in shape too: color is never the only difference.
 */
export const CONTRAST_PAIRS: readonly (readonly [ThemeRole, ThemeRole, number])[] = [
  ["piece", "board", 3],
  ["wall", "board", 3],
  ["figure", "board", 3],
  ["target", "board", 3],
  ["done", "board", 3],
  ["accent", "board", 3],
  ["figure", "accent", 2],
  ["done", "piece", 1.5],
  ["line", "board", 1.2],
];

/** Colors fixed by the rules (e.g. laser colors), drawn on the board: the light variant on light boards, `dark` on dark ones. */
export type FixedColor = { light: string; dark: string };
export const FIXED_MIN_CONTRAST = 2;

/** What a type's renderer takes from a theme (from its rules, so the server can check it). */
export type ThemeUse = { roles: readonly ThemeRole[]; fixed?: readonly FixedColor[] };

export type ContrastProblem = { a: ThemeRole; b: ThemeRole | "fixed"; ratio: number; min: number };

export function fixedOn(board: string, color: FixedColor): string {
  return isDark(board) ? color.dark : color.light;
}

/** Pairs of this type whose contrast is too low in the theme; empty = fine. */
export function contrastProblems(theme: PuzzleTheme, use: ThemeUse): ContrastProblem[] {
  const has = new Set(use.roles);
  const { colors } = theme;
  const problems: ContrastProblem[] = [];
  for (const [a, b, min] of CONTRAST_PAIRS) {
    if (!has.has(a) || !has.has(b)) continue;
    const ratio = contrast(colors[a], colors[b]);
    if (ratio < min) problems.push({ a, b, ratio, min });
  }
  for (const color of use.fixed ?? []) {
    const ratio = contrast(fixedOn(colors.board, color), colors.board);
    if (ratio < FIXED_MIN_CONTRAST) problems.push({ a: "board", b: "fixed", ratio, min: FIXED_MIN_CONTRAST });
  }
  return problems;
}
