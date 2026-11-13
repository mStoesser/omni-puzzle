// Keyboard focus for the board while playing: on desktop the board takes the focus when a puzzle starts, so arrow
// keys work at once. And when nothing has the focus (a click on the page background), a key goes to the board.

/** The element of the board that takes keys: the board itself (Sokoban) or the cell in the tab order (roving tabindex). */
function boardTarget(): HTMLElement | SVGElement | null {
  return document.querySelector<HTMLElement | SVGElement>('.board [tabindex="0"]');
}

/** Nothing has the focus: the body (or nothing) is the active element. */
function nothingFocused(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === document.documentElement;
}

/** Desktop: a fine pointer that can hover. On touch screens the focus ring would only distract. */
function isDesktop(): boolean {
  return typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
}

let focusedFor: unknown = null;

/**
 * Called after each render. `key` changes when another puzzle starts (a new level, a test play); for each key the
 * board is focused once, and only when the focus is nowhere else (an open dialog or a text field keeps it).
 */
export function focusBoardOnStart(key: unknown) {
  if (key === null) {
    focusedFor = null;
    return;
  }
  if (key === focusedFor || !isDesktop()) return;
  const target = boardTarget();
  if (!target) return; // not rendered yet: try again after the next render
  focusedFor = key;
  if (nothingFocused()) target.focus({ preventScroll: true });
}

/**
 * A keydown (capture, on the document) while nothing has the focus: focuses the board and hands it the key, so the
 * move happens. Tab keeps its normal job. Returns false when the key was not forwarded.
 */
export function forwardKeyToBoard(e: KeyboardEvent, active: boolean): boolean {
  if (!active || e.key === "Tab" || e.isComposing || !e.isTrusted || !nothingFocused()) return false;
  const target = boardTarget();
  if (!target) return false;
  target.focus({ preventScroll: true });
  const copy = new KeyboardEvent("keydown", {
    key: e.key,
    code: e.code,
    location: e.location,
    repeat: e.repeat,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    bubbles: true,
    cancelable: true,
  });
  // The copy runs through the board and on to the shortcuts on the document; the original stops here.
  e.stopImmediatePropagation();
  if (!target.dispatchEvent(copy)) e.preventDefault();
  return true;
}
