// QR code encoder (M38), after ISO/IEC 18004. Pure, no DOM; the UI draws the module grid as SVG.
//
// Only byte mode (links are ASCII; no ECI, so other bytes are read as ISO-8859-1 or guessed as UTF-8 by scanners),
// versions 1 to 40, all four error correction levels and the eight masks. The encoder picks the smallest version
// for the data at the minimum level, then raises the level as long as the data still fits that version, and picks
// the mask with the lowest penalty (ties: the lower mask).

export type QrLevel = "L" | "M" | "Q" | "H";

export type QrCode = {
  version: number; // 1..40
  level: QrLevel;
  mask: number; // 0..7
  size: number; // modules per side: 17 + 4 * version
  /** Row by row; true = dark. */
  modules: readonly (readonly boolean[])[];
};

export type QrOptions = {
  minLevel?: QrLevel; // default "M"
  boostLevel?: boolean; // default true
  minVersion?: number; // default 1
  mask?: number; // default: the best one
};

const LEVELS: readonly QrLevel[] = ["L", "M", "Q", "H"];
const LEVEL_INDEX = { L: 0, M: 1, Q: 2, H: 3 } as const;
/** The two format bits of each level (not in level order). */
const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 } as const;

// Per level, indexed by version (index 0 unused).
// prettier-ignore
const ECC_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Modules available for data and error correction (everything but the function patterns), in bits. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (bytes) of a version and level, without the error correction. */
export function dataCodewords(version: number, level: QrLevel): number {
  const l = LEVEL_INDEX[level];
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[l]![version]! * BLOCKS[l]![version]!;
}

/** Bytes that fit into a version at a level in byte mode. */
export function byteCapacity(version: number, level: QrLevel): number {
  const countBits = version <= 9 ? 8 : 16;
  return Math.floor((dataCodewords(version, level) * 8 - 4 - countBits) / 8);
}

/** Centers of the alignment patterns along one axis. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

// --- Reed-Solomon over GF(2^8) with the polynomial 0x11D ---

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error correction codewords of `data`. */
export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => (result[i]! ^= gfMultiply(coef, factor)));
  }
  return result;
}

// --- Encoding ---

/** UTF-8 bytes of a text, e.g. a link. */
export function qrBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The QR code of `bytes`, or null if they do not fit into version 40 at the minimum level. */
export function encodeQr(bytes: Uint8Array, options: QrOptions = {}): QrCode | null {
  const minLevel = options.minLevel ?? "M";
  const minVersion = options.minVersion ?? 1;
  if (!Number.isInteger(minVersion) || minVersion < 1 || minVersion > 40) throw new RangeError("version");
  if (options.mask !== undefined && (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 7)) throw new RangeError("mask");

  let version = minVersion;
  while (bytes.length > byteCapacity(version, minLevel)) {
    if (version === 40) return null;
    version++;
  }
  let level = minLevel;
  if (options.boostLevel !== false) {
    for (const next of LEVELS.slice(LEVEL_INDEX[minLevel] + 1)) if (bytes.length <= byteCapacity(version, next)) level = next;
  }

  const codewords = interleave(dataBytes(bytes, version, level), version, level);
  const grid = new Grid(version);
  grid.drawFunctionPatterns(LEVEL_BITS[level]);
  grid.drawCodewords(codewords);

  let mask = options.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      grid.applyMask(m);
      grid.drawFormat(LEVEL_BITS[level], m);
      const penalty = grid.penalty();
      if (penalty < best) {
        best = penalty;
        mask = m;
      }
      grid.applyMask(m); // undo (XOR)
    }
  }
  grid.applyMask(mask);
  grid.drawFormat(LEVEL_BITS[level], mask);
  return { version, level, mask, size: grid.size, modules: grid.modules };
}

/** Mode, count, data, terminator and padding: the data codewords. */
function dataBytes(bytes: Uint8Array, version: number, level: QrLevel): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords(version, level) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) result.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  for (let pad = 0xec; result.length < capacity / 8; pad ^= 0xec ^ 0x11) result.push(pad);
  return result;
}

/** Splits the data into blocks, adds error correction to each and interleaves them. */
function interleave(data: readonly number[], version: number, level: QrLevel): number[] {
  const l = LEVEL_INDEX[level];
  const blockCount = BLOCKS[l]![version]!;
  const eccLength = ECC_PER_BLOCK[l]![version]!;
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blockCount - (raw % blockCount);
  const shortLength = Math.floor(raw / blockCount);
  const divisor = rsDivisor(eccLength);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0); // placeholder, skipped below
    blocks.push([...block, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]!);
    });
  }
  return result;
}

const PENALTY = { run: 3, block: 3, finder: 40, balance: 10 } as const;

/** The module grid while encoding: mutable inside this module only. */
class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly reserved: boolean[][];
  private readonly version: number;

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private set(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark;
    this.reserved[y]![x] = true;
  }

  drawFunctionPatterns(levelBits: number) {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    const positions = alignmentPositions(this.version);
    const last = positions.length - 1;
    positions.forEach((x, i) =>
      positions.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; // finders
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.drawFormat(levelBits, 0); // reserves the area; drawn again after masking
    this.drawVersion();
  }

  private drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  drawFormat(levelBits: number, mask: number) {
    const data = (levelBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const { size } = this;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true); // the dark module
  }

  private drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  /** Zigzag from the bottom right, two columns at a time, skipping the vertical timing pattern. */
  drawCodewords(codewords: readonly number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.reserved[y]![x] && i < codewords.length * 8) {
            this.modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
          // Remainder bits (left over modules) stay light.
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.reserved[y]![x] && maskBit(mask, x, y)) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }

  /** The penalty score of the standard (N1 to N4) for choosing the mask. */
  penalty(): number {
    const { size, modules } = this;
    let result = 0;
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let color = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          if (get(a, b) === color) {
            run++;
            if (run === 5) result += PENALTY.run;
            else if (run > 5) result++;
          } else {
            this.addHistory(run, history);
            if (!color) result += this.finderLike(history) * PENALTY.finder;
            color = get(a, b);
            run = 1;
          }
        }
        result += this.terminate(color, run, history) * PENALTY.finder;
      }
    };
    lines((y, x) => modules[y]![x]!);
    lines((x, y) => modules[y]![x]!);

    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = modules[y]![x]!;
        if (c) dark++;
        if (x < size - 1 && y < size - 1 && c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) {
          result += PENALTY.block;
        }
      }
    }
    const total = size * size;
    result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY.balance;
    return result;
  }

  /** Patterns 1:1:3:1:1 (dark-light-dark-light-dark) with 4 light modules on one side. */
  private finderLike(history: readonly number[]): number {
    const n = history[1]!;
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) + (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0);
  }

  private terminate(color: boolean, run: number, history: number[]): number {
    if (color) {
      this.addHistory(run, history);
      run = 0;
    }
    run += this.size; // the light quiet zone after the line
    this.addHistory(run, history);
    return this.finderLike(history);
  }

  private addHistory(run: number, history: number[]) {
    if (history[0] === 0) run += this.size; // the light quiet zone before the line
    history.pop();
    history.unshift(run);
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Quiet zone around the code, in modules (the standard asks for 4). */
export const QR_QUIET_ZONE = 4;

/**
 * SVG path data of the dark modules, one rectangle per horizontal run, in module units (origin = top left module).
 * Drawn on a light background with a viewBox that includes the quiet zone.
 */
export function qrPath(code: QrCode): string {
  const parts: string[] = [];
  code.modules.forEach((row, y) => {
    for (let x = 0; x < code.size; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < code.size && row[end + 1]) end++;
      parts.push(`M${x} ${y}h${end - x + 1}v1h${x - end - 1}z`);
      x = end;
    }
  });
  return parts.join("");
}
