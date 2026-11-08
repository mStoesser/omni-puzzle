// Icon catalog (M31): pictures for parts whose shape carries no game information (a figure, a box, a goal, a rock,
// a lamp). Pure and DOM-free, so the publish function knows the catalog too. The SVG files live in
// src/icons/pieces/<id>.svg and are loaded by the UI only (ui/piece-icons.ts); a test keeps both lists equal.
//
// Ids stay stable and the catalog only grows: a puzzle stores ids, and an id this version does not know is dropped
// (the part is drawn as before).

/** Parts that can show an icon. Only where the shape is not game information (not pipes, mirrors, blocks …). */
export const ICON_ROLES = ["figure", "box", "goal", "rock", "lamp"] as const;
export type IconRole = (typeof ICON_ROLES)[number];

export const PIECE_ICONS = [
  "cat",
  "robot",
  "penguin",
  "ghost",
  "gift",
  "apple",
  "barrel",
  "star",
  "flag",
  "flower",
  "tree",
  "cactus",
  "rock",
  "sun",
  "moon",
] as const;
export type PieceIcon = (typeof PIECE_ICONS)[number];

export function isPieceIcon(value: unknown): value is PieceIcon {
  return typeof value === "string" && (PIECE_ICONS as readonly string[]).includes(value);
}

export function isIconRole(value: unknown): value is IconRole {
  return typeof value === "string" && (ICON_ROLES as readonly string[]).includes(value);
}
