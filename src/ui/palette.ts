// Role palettes of the puzzle renderers (M29). Pure: builds CSS text, no DOM.
//
// Each renderer lists its CSS custom properties once, with the default colors (light and dark, as before M29) and
// where the value comes from in a theme: a role, or a function of the theme's colors (e.g. a darker edge).
// Without a theme the defaults follow the app theme; with one, the root element of the board gets the theme's values
// as an inline style, which beats the defaults. So a themed board looks the same in light and dark mode.

import type { PuzzleTheme, ThemeColors, ThemeRole } from "../core/puzzle-theme.ts";
import { THEME_ROLES } from "../core/puzzle-theme.ts";

export type PaletteVar = {
  light: string;
  dark: string;
  theme: ThemeRole | ((colors: ThemeColors) => string);
};

/** `scope`: the selector of the board's root element (e.g. ".rh"); `vars` by custom property name ("--rh-board"). */
export type Palette = { scope: string; vars: Readonly<Record<string, PaletteVar>> };

function declarations(palette: Palette, pick: (v: PaletteVar) => string): string {
  return Object.entries(palette.vars)
    .map(([name, v]) => `${name}: ${pick(v)};`)
    .join(" ");
}

/** CSS for the default colors: light, and dark per app theme (data-theme on <html>, or the system setting without it). */
export function paletteCss(palette: Palette): string {
  const { scope } = palette;
  const dark = declarations(palette, (v) => v.dark);
  return `${scope} { ${declarations(palette, (v) => v.light)} }
  :root[data-theme="dark"] ${scope} { ${dark} }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) ${scope} { ${dark} } }`;
}

const styles = new WeakMap<Palette, WeakMap<PuzzleTheme, string>>();

/** Inline style with the theme's values for the board's root element; "" without a theme (default colors). */
export function paletteStyle(palette: Palette, theme: PuzzleTheme | undefined): string {
  if (!theme) return "";
  let cache = styles.get(palette);
  if (!cache) styles.set(palette, (cache = new WeakMap()));
  let style = cache.get(theme);
  if (style === undefined) {
    style = declarations(palette, (v) => (typeof v.theme === "string" ? theme.colors[v.theme] : v.theme(theme.colors)));
    cache.set(theme, style);
  }
  return style;
}

/** The roles a palette takes from a theme (for tests: they must match the type's `themeRoles`). */
export function paletteRoles(palette: Palette): ThemeRole[] {
  const used = new Set<ThemeRole>();
  const colors = new Proxy({} as ThemeColors, {
    get(_target, role: string) {
      used.add(role as ThemeRole);
      return "#808080";
    },
  });
  for (const v of Object.values(palette.vars)) {
    if (typeof v.theme === "string") used.add(v.theme);
    else v.theme(colors);
  }
  return THEME_ROLES.filter((role) => used.has(role));
}
