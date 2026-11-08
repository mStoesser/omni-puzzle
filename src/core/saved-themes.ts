// Own theme templates (M30): saved on this device only (IndexedDB meta store, key SAVED_THEMES_KEY), not synced.
// A puzzle never refers to a template: it carries its colors in meta.theme, so deleting a template changes no puzzle.
import { parseTheme } from "./puzzle-theme.ts";
import type { PuzzleTheme } from "./puzzle-theme.ts";

export type SavedTheme = { id: string; name: string; theme: PuzzleTheme };

export const SAVED_THEMES_KEY = "themes";
export const SAVED_THEME_LIMITS = { maxThemes: 50, maxName: 40 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trimmed name, or null if empty or too long. */
export function cleanThemeName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, " ");
  return clean.length === 0 || clean.length > SAVED_THEME_LIMITS.maxName ? null : clean;
}

/** The stored list; broken entries are skipped (e.g. from a newer app version), duplicates by id keep the first. */
export function parseSavedThemes(raw: unknown): SavedTheme[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: SavedTheme[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== "string" || seen.has(entry.id) || typeof entry.name !== "string") continue;
    const name = cleanThemeName(entry.name);
    const theme = parseTheme(entry.theme);
    if (!name || !theme) continue;
    seen.add(entry.id);
    list.push({ id: entry.id, name, theme });
    if (list.length === SAVED_THEME_LIMITS.maxThemes) break;
  }
  return list;
}

export type SaveResult = { list: SavedTheme[]; error?: "name" | "full" };

/** Adds a template at the end; the list is unchanged with an invalid name or when it is full. */
export function addSavedTheme(list: readonly SavedTheme[], id: string, name: string, theme: PuzzleTheme): SaveResult {
  const clean = cleanThemeName(name);
  if (!clean) return { list: [...list], error: "name" };
  if (list.length >= SAVED_THEME_LIMITS.maxThemes) return { list: [...list], error: "full" };
  return { list: [...list, { id, name: clean, theme }] };
}

export function renameSavedTheme(list: readonly SavedTheme[], id: string, name: string): SaveResult {
  const clean = cleanThemeName(name);
  if (!clean) return { list: [...list], error: "name" };
  return { list: list.map((entry) => (entry.id === id ? { ...entry, name: clean } : entry)) };
}

export function removeSavedTheme(list: readonly SavedTheme[], id: string): SavedTheme[] {
  return list.filter((entry) => entry.id !== id);
}
