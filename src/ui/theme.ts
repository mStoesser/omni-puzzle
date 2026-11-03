// Theme choice: "dark" (default), "light" or "system". Stored per device in localStorage.
// "dark"/"light" set data-theme on <html>; "system" removes it, then prefers-color-scheme decides (tokens.css).
// index.html applies the stored choice before the first paint with the same rules (inline script).

export type ThemeChoice = "dark" | "light" | "system";

export const THEME_KEY = "knobelkiste-theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light", "system"];

/** Background colors for the browser chrome (meta theme-color), same as --kk-bg. */
const CHROME_COLOR = { dark: "#0F1115", light: "#F6F5F1" } as const;

export function parseTheme(value: string | null): ThemeChoice {
  return value === "light" || value === "system" ? value : "dark";
}

export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "dark";
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  const effective = choice === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME_COLOR[effective]);
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // not stored; applies to this visit only
  }
  applyTheme(choice);
}

/** Keeps the browser chrome color in sync when the system scheme changes while "system" is chosen. */
export function watchSystemTheme() {
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
}
