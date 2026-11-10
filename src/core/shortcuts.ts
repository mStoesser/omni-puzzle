// Keyboard shortcuts in play and editor (M33). Pure: maps a key press to an action and describes the shortcuts for the
// overview; main.ts listens on the document and carries the actions out. Puzzles handle their own keys first (arrow keys,
// WASD, Enter on a cell) and mark them with preventDefault, so a shortcut never steals a move.

import type { MessageKey } from "../i18n/t.ts";

/** Where the key was pressed: playing, building in the editor, or test play inside the editor. */
export type ShortcutContext = "play" | "editor" | "test";

export type Shortcut =
  | { action: "undo" }
  | { action: "redo" }
  | { action: "restart" }
  | { action: "mode" } // editor: switch between building and test play
  | { action: "tool"; index: number } // editor: select the n-th tool of the palette (0-based)
  | { action: "help" };

/** The parts of a KeyboardEvent the mapping needs. */
export type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** Number of tools reachable by digit: 1–9, then 0 for the tenth. */
export const TOOL_KEYS = 10;

/**
 * The shortcut for a key press, or null. `mac`: the primary modifier is Cmd instead of Ctrl.
 * Alt never counts (AltGr types characters like @ on many layouts and reports Ctrl+Alt).
 */
export function shortcutFor(input: KeyInput, context: ShortcutContext, mac: boolean): Shortcut | null {
  if (input.altKey) return null;
  const primary = mac ? input.metaKey : input.ctrlKey;
  const other = mac ? input.ctrlKey : input.metaKey;
  if (other) return null;
  const key = input.key.toLowerCase();
  if (primary) {
    if (key === "z") return { action: input.shiftKey ? "redo" : "undo" };
    if (key === "y" && !input.shiftKey) return { action: "redo" };
    return null;
  }
  if (input.key === "?") return { action: "help" };
  if (input.shiftKey) return null;
  if (key === "r" && context !== "editor") return { action: "restart" };
  if (key === "p" && context !== "play") return { action: "mode" };
  if (context === "editor" && /^[0-9]$/.test(key)) return { action: "tool", index: key === "0" ? 9 : Number(key) - 1 };
  return null;
}

/** The focused element, as far as the mapping needs it. */
export type KeyTarget = { tagName?: string; type?: string; isContentEditable?: boolean };

const KEYS_STAY_IN_FIELD = new Set(["text", "search", "url", "email", "password", "number", "tel", "date", "time"]);

/**
 * True if keys belong to the focused element: text fields (they have their own undo), selects, editable content.
 * Radio buttons, checkboxes, color inputs and buttons do not need letter or digit keys, so shortcuts work there.
 */
export function keysStayInTarget(target: KeyTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return tag === "INPUT" && KEYS_STAY_IN_FIELD.has((target.type ?? "text").toLowerCase());
}

/** A key or a combination as shown in the overview, e.g. ["Strg", "Z"]. */
export type KeyCombo = readonly string[];
export type ShortcutRow = { combos: readonly KeyCombo[]; label: MessageKey };

/**
 * The shortcuts of a context for the overview. `ctrl`: the label of the Ctrl key ("Strg" on German keyboards);
 * `undo`: whether the type has undo (a quiz has none).
 */
export function shortcutRows(context: ShortcutContext, mac: boolean, ctrl: string, undo = true): ShortcutRow[] {
  const mod = mac ? "⌘" : ctrl;
  const rows: ShortcutRow[] = [];
  if (context === "editor" || undo) {
    rows.push({ combos: [[mod, "Z"]], label: "undo" });
    rows.push({ combos: mac ? [[mod, "⇧", "Z"]] : [[mod, "Y"], [mod, "⇧", "Z"]], label: "redo" });
  }
  if (context !== "editor") rows.push({ combos: [["R"]], label: "restart" });
  if (context === "play" || context === "test") rows.push({ combos: [["←", "↑", "→", "↓"], ["W", "A", "S", "D"]], label: "shortcutsMove" });
  if (context === "editor") rows.push({ combos: [["1 … 9", "0"]], label: "shortcutsTool" });
  if (context !== "play") rows.push({ combos: [["P"]], label: context === "editor" ? "testPlay" : "shortcutsBuild" });
  rows.push({ combos: [["?"]], label: "shortcutsHelp" });
  return rows;
}

/** Value of aria-keyshortcuts for a button (key names as in the ARIA spec), e.g. "Control+Z". */
export function ariaShortcut(action: "undo" | "redo" | "restart" | "mode", mac: boolean): string {
  const mod = mac ? "Meta" : "Control";
  switch (action) {
    case "undo":
      return `${mod}+Z`;
    case "redo":
      return mac ? `${mod}+Shift+Z` : `${mod}+Y ${mod}+Shift+Z`;
    case "restart":
      return "R";
    case "mode":
      return "P";
  }
}

/** Short form for a tooltip, e.g. "Strg+Z" or "⌘⇧Z"; `ctrl` as in shortcutRows. */
export function shortcutHint(action: "undo" | "redo" | "restart" | "mode", mac: boolean, ctrl: string): string {
  switch (action) {
    case "undo":
      return mac ? "⌘Z" : `${ctrl}+Z`;
    case "redo":
      return mac ? "⌘⇧Z" : `${ctrl}+Y`;
    case "restart":
      return "R";
    case "mode":
      return "P";
  }
}
