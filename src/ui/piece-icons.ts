// Icons from the catalog (M31) for the board renderers. The files come from the repository and pass
// core/icon-catalog.test.ts (only shapes with the classes main and detail), which is why inserting them as markup is
// fine here; puzzles only carry catalog ids, never SVG. Colors come from --icon-main and --icon-detail, which each
// renderer sets per part.
import { svg } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import type { PieceIcon } from "../core/icon-catalog.ts";

function loadFiles(): Record<string, string> {
  try {
    // Vite inlines the files at build time (offline, no new package). Under node --test there is no Vite.
    return import.meta.glob("../icons/pieces/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  } catch {
    return {};
  }
}

const BODIES = new Map<string, string>(
  Object.entries(loadFiles()).map(([path, text]) => [
    path.replace(/^.*\/(.+)\.svg$/, "$1"),
    text.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""),
  ]),
);

/** Whether this version can draw the icon (otherwise the renderer draws the part as before). */
export function hasPieceIcon(id: PieceIcon | undefined): id is PieceIcon {
  return id !== undefined && BODIES.has(id);
}

/** The icon in a square at (x, y) of `size` board units; null if there is no such icon. */
export function pieceIcon(id: PieceIcon | undefined, x: number, y: number, size: number, extraClass = "") {
  const body = id === undefined ? undefined : BODIES.get(id);
  if (body === undefined) return null;
  // A group, not a nested <svg>: page CSS for svg elements (e.g. width: 100% on boards) must not resize it.
  return svg`<g class="piece-icon ${extraClass}" transform="translate(${x} ${y}) scale(${size / 100})" aria-hidden="true"
    >${unsafeSVG(body)}</g>`;
}

/** CSS for every board that shows icons: the theme colors the classes of the catalog files. */
export const PIECE_ICON_CSS = `.piece-icon { pointer-events: none; }
  .piece-icon .main { fill: var(--icon-main, currentColor); }
  .piece-icon .detail { fill: var(--icon-detail, #ffffff); }`;
