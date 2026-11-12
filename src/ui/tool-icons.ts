import { svg } from "lit-html";

// Line icons for the editor tools (M39), drawn like ui/icons.ts: 24 viewBox, stroke 2, round caps and joins,
// colored via currentColor (iconSvg). Shared by the puzzle types, which pick them in their editor palette.
// Some shapes follow Lucide (https://lucide.dev, ISC license, © Lucide Contributors): eraser, brick-wall, flashlight,
// funnel, palette, mouse-pointer-click, lightbulb, droplet, pin, rotate-cw, arrow-right-to-line, image, user-round,
// x, zoom-in.

const rotate = svg`<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>`;

export const TOOL_ICONS = {
  erase: svg`<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>`,
  wall: svg`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 9v6"/><path d="M16 15v6"/><path d="M16 3v6"/><path d="M3 15h18"/><path d="M3 9h18"/><path d="M8 15v6"/><path d="M8 3v6"/>`,
  goal: svg`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>`,
  target: svg`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
  player: svg`<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>`,
  box: svg`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 3 18 18"/><path d="M21 3 3 21"/>`,
  sand: svg`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/>`,
  fill: svg`<rect width="18" height="18" x="3" y="3" rx="2" fill="currentColor"/>`,
  hole: svg`<rect width="18" height="18" x="3" y="3" rx="2" stroke-dasharray="4 3"/>`,
  // Blocks by size in cells; the lines mark the cells.
  block11: svg`<rect width="10" height="10" x="7" y="7" rx="2"/>`,
  block21: svg`<rect width="20" height="10" x="2" y="7" rx="2"/><path d="M12 7v10"/>`,
  block12: svg`<rect width="10" height="20" x="7" y="2" rx="2"/><path d="M7 12h10"/>`,
  block22: svg`<rect width="20" height="20" x="2" y="2" rx="2"/><path d="M12 2v20"/><path d="M2 12h20"/>`,
  block3: svg`<rect width="20" height="8" x="2" y="8" rx="2"/><path d="M8.67 8v8"/><path d="M15.33 8v8"/>`,
  targetBlock: svg`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m12 7.5 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z"/>`,
  exit: svg`<path d="M17 12H3"/><path d="m11 18 6-6-6-6"/><path d="M21 5v14"/>`,
  // Laser
  emitter: svg`<path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><path d="M6 6h12"/><path d="M12 12v.01"/>`,
  mirror: svg`<path d="M4 20 20 4"/><path d="m8 16 2 2"/><path d="m12 12 2 2"/><path d="m16 8 2 2"/>`,
  rotatable: svg`${rotate}<path d="m9 15 6-6"/>`,
  splitter: svg`<path d="M5 19 19 5" stroke-dasharray="2 3"/><path d="M2 12h20"/><path d="M12 12v9"/>`,
  rotatableSplitter: svg`${rotate}<path d="m9 15 6-6" stroke-dasharray="2 2.5"/>`,
  filter: svg`<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>`,
  color: svg`<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>`,
  // Lights out
  press: svg`<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>`,
  light: svg`<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>`,
  // Pipes
  pipe: svg`<path d="M2 6h6a10 10 0 0 1 10 10v6"/><path d="M2 13h6a3 3 0 0 1 3 3v6"/>`,
  source: svg`<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>`,
  turn: rotate,
  fixed: svg`<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>`,
  // Nonogram play tools
  cross: svg`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  zoom: svg`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>`,
  // Quiz
  image: svg`<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`,
} as const;

export type ToolIconName = keyof typeof TOOL_ICONS;
