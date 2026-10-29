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
