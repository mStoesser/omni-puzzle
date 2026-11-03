export type Dir = "N" | "E" | "S" | "W";

export type Point = { readonly x: number; readonly y: number };

/** All directions in clockwise order. */
export const DIRS: readonly Dir[] = ["N", "E", "S", "W"];

/** Unit vectors per direction; y grows downwards. */
export const DELTA = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
} as const satisfies Record<Dir, readonly [number, number]>;

export function isDir(value: unknown): value is Dir {
  return value === "N" || value === "E" || value === "S" || value === "W";
}

/** Rotates by the given number of quarter turns; positive is clockwise. */
export function rotate(dir: Dir, quarterTurns: number): Dir {
  const index = DIRS.indexOf(dir) + quarterTurns;
  return DIRS[((index % 4) + 4) % 4]!;
}

export function rotateCW(dir: Dir): Dir {
  return rotate(dir, 1);
}

export function rotateCCW(dir: Dir): Dir {
  return rotate(dir, -1);
}

export function opposite(dir: Dir): Dir {
  return rotate(dir, 2);
}

export function step(p: Point, dir: Dir, distance = 1): Point {
  const [dx, dy] = DELTA[dir];
  return { x: p.x + dx * distance, y: p.y + dy * distance };
}

export function inBounds(p: Point, width: number, height: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
}

/** Stable string key for maps and sets, e.g. "3,4". */
export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

/**
 * Direction of a swipe from its displacement (screen pixels, y downwards): the dominant axis wins.
 * Null if the swipe is shorter than `minDistance` or exactly diagonal.
 */
export function swipeDir(dx: number, dy: number, minDistance: number): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < minDistance || ax === ay) return null;
  if (ax > ay) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

const KEY_DIRS: Readonly<Record<string, Dir>> = {
  arrowup: "N",
  arrowright: "E",
  arrowdown: "S",
  arrowleft: "W",
  w: "N",
  d: "E",
  s: "S",
  a: "W",
};

/** Direction for a keyboard key (`KeyboardEvent.key`): arrow keys and WASD, any case. */
export function keyDir(key: string): Dir | null {
  return KEY_DIRS[key.toLowerCase()] ?? null;
}

/**
 * The cells from `from` (exclusive) to `to` (inclusive) along a straight line, each orthogonally adjacent
 * to the previous one, e.g. to fill the gaps between two pointer positions of a paint stroke.
 */
export function lineCells(from: Point, to: Point): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const cells: Point[] = [];
  let x = from.x;
  let y = from.y;
  // Walk one step at a time; take the axis whose next crossing of the ideal line comes first.
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    if ((0.5 + ix) * ny < (0.5 + iy) * nx || iy === ny) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    cells.push({ x, y });
  }
  return cells;
}
