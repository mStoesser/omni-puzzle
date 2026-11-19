// Escape rooms (M43): can the room be won, and what can never be reached? Like the solvers for puzzles, a bounded
// search over the states (scene, switches, solved puzzles, open locks), with a reduced search for large rooms. It assumes the player solves every puzzle and
// knows every code; whether a code can really be found is only guessed from the texts ("lock-code-hidden").

import type { Effect, EscapeRoomData, Opening, Progress, Spot } from "./logic.ts";
import { activeSpots, applyEvent, normalizeCode, startProgress } from "./logic.ts";

export type RoomProblemCode =
  | "no-win" // no tap area, puzzle or lock leads to the victory
  | "unwinnable" // the search found no way to win
  | "aborted" // too many states even for the reduced search; reachability is not known
  | "dead-end" // a reachable state from which the victory can no longer be reached (e.g. a needed area disappeared)
  | "scene-unreachable"
  | "spot-unreachable" // id = "scene/spot"
  | "puzzle-unreachable"
  | "lock-unreachable"
  | "view-unreachable"
  | "flag-unused" // never turned on
  | "puzzle-not-verified" // its creator has not solved it
  | "lock-code-hidden"; // the code appears in no text, result or hint (it may be in a picture)

export type RoomProblem = { code: RoomProblemCode; id?: string };

export type RoomCheck = {
  status: "winnable" | "unwinnable" | "aborted";
  /**
   * Fewest actions to win (a tap, together with solving the puzzle or entering the code it opens); null unless winnable
   * and found by the exact search.
   */
  steps: number | null;
  /** Reachable states that can no longer be won; null = not known (large rooms, see `checkEscapeRoom`). */
  deadEnds: number | null;
  problems: RoomProblem[];
};

export const CHECK_LIMITS = { maxStates: 20_000 } as const;

const keyOf = (p: Progress) => `${p.scene}|${p.shared.flags.join(",")}|${p.shared.solved.join(",")}|${p.shared.opened.join(",")}|${p.shared.won ? 1 : 0}`;

type Seen = { scenes: Set<string>; spots: Set<string>; puzzles: Set<string>; locks: Set<string>; views: Set<string>; flags: Set<string> };

/** One way on from a state: a tap, or a tap with solving its puzzle or entering its lock's code. */
type Move = { spot: Spot; progress: Progress };

/** All ways on from `progress`; records what they open. Won states have none. */
function movesFrom(data: EscapeRoomData, progress: Progress, seen: Seen): Move[] {
  if (progress.shared.won) return [];
  const moves: Move[] = [];
  const saw = (open: Opening | null) => {
    if (open?.kind === "view") seen.views.add(open.view);
    if (open?.kind === "puzzle") seen.puzzles.add(open.puzzle);
    if (open?.kind === "lock") seen.locks.add(open.lock);
  };
  for (const spot of activeSpots(data, progress)) {
    seen.spots.add(`${progress.scene}/${spot.id}`);
    const tap = applyEvent(data, progress, { kind: "spot", spot: spot.id });
    saw(tap.open);
    moves.push({ spot, progress: tap.progress });
    const open = tap.open;
    if (open?.kind === "puzzle") {
      const solved = applyEvent(data, tap.progress, { kind: "solved", puzzle: open.puzzle });
      saw(solved.open);
      moves.push({ spot, progress: solved.progress });
    }
    if (open?.kind === "lock") {
      const lock = data.locks.find((l) => l.id === open.lock)!;
      const opened = applyEvent(data, tap.progress, { kind: "code", lock: lock.id, code: lock.code });
      saw(opened.open);
      moves.push({ spot, progress: opened.progress });
    }
  }
  return moves;
}

/**
 * Whether a move can never spoil anything: it stays in the scene, turns on no switch that some area needs off, and its
 * own area needs no switch off (so it cannot disappear while the player stays). Then doing it at once is as good as
 * doing it later: everything it adds only enables more.
 */
function harmless(move: Move, from: Progress, risky: ReadonlySet<string>): boolean {
  return (
    move.progress.scene === from.scene &&
    move.spot.when.every((c) => c.on) &&
    move.progress.shared.flags.every((f) => from.shared.flags.includes(f) || !risky.has(f))
  );
}

/** Applies harmless moves until nothing changes. */
function saturate(data: EscapeRoomData, progress: Progress, risky: ReadonlySet<string>, seen: Seen): Progress {
  let current = progress;
  for (let changed = true; changed; ) {
    changed = false;
    for (const move of movesFrom(data, current, seen)) {
      if (harmless(move, current, risky) && keyOf(move.progress) !== keyOf(current)) {
        current = move.progress;
        changed = true;
        break; // the other moves were computed from the state before
      }
    }
  }
  return current;
}

type Search = { aborted: boolean; states: Progress[]; edges: [number, number][]; winAt: number | null; seen: Seen };

/**
 * Breadth-first search over the states. With `risky` (the switches some area needs off), harmless moves are taken at
 * once and only the others branch: far fewer states, still exact about winning and about what can be reached (every
 * saturated state is reachable and enables at least what the states before it did), but not about dead ends or the
 * fewest actions.
 */
function search(data: EscapeRoomData, maxStates: number, risky: ReadonlySet<string> | null): Search {
  const seen: Seen = { scenes: new Set(), spots: new Set(), puzzles: new Set(), locks: new Set(), views: new Set(), flags: new Set() };
  const states: Progress[] = [];
  const depth: number[] = [];
  const index = new Map<string, number>();
  const edges: [number, number][] = [];
  let aborted = false;
  let winAt: number | null = null;
  const visit = (from: number | null, reached: Progress) => {
    const progress = risky ? saturate(data, reached, risky, seen) : reached;
    const key = keyOf(progress);
    let at = index.get(key);
    if (at === undefined) {
      if (states.length >= maxStates) {
        aborted = true;
        return;
      }
      at = states.length;
      index.set(key, at);
      states.push(progress);
      depth.push(from === null ? 0 : depth[from]! + 1);
      if (progress.shared.won && winAt === null) winAt = depth[at]!;
    }
    if (from !== null) edges.push([from, at]);
  };
  visit(null, startProgress(data));
  for (let i = 0; i < states.length && !aborted; i++) {
    const progress = states[i]!;
    seen.scenes.add(progress.scene);
    for (const flag of progress.shared.flags) seen.flags.add(flag);
    for (const move of movesFrom(data, progress, seen)) visit(i, move.progress);
  }
  return { aborted, states, edges, winAt, seen };
}

/** Reachable states from which no won state can be reached. */
function countDeadEnds({ states, edges }: Search): number {
  const back = new Map<number, number[]>();
  for (const [from, to] of edges) {
    const list = back.get(to);
    if (list) list.push(from);
    else back.set(to, [from]);
  }
  const queue = states.flatMap((p, i) => (p.shared.won ? [i] : []));
  const canWin = new Set(queue);
  while (queue.length > 0) {
    for (const from of back.get(queue.pop()!) ?? []) {
      if (!canWin.has(from)) {
        canWin.add(from);
        queue.push(from);
      }
    }
  }
  return states.length - canWin.size;
}

/**
 * Checks an escape room (loaded with `loadEscapeRoom`). First an exact search; if the room has too many states (e.g.
 * many switches that can be turned on in any order), a reduced one that still answers whether it can be won and what
 * can be reached, without dead ends and fewest actions.
 */
export function checkEscapeRoom(data: EscapeRoomData, limits: { maxStates: number } = CHECK_LIMITS): RoomCheck {
  const problems: RoomProblem[] = [];
  const allEffects: Effect[] = [
    ...data.scenes.flatMap((s) => s.spots.flatMap((spot) => spot.action)),
    ...data.puzzles.flatMap((p) => p.onSolve),
    ...data.locks.flatMap((l) => l.onOpen),
  ];
  if (!allEffects.some((e) => e.do === "win")) problems.push({ code: "no-win" });
  for (const puzzle of data.puzzles) if (puzzle.doc.meta.verified !== true) problems.push({ code: "puzzle-not-verified", id: puzzle.id });
  const texts = normalizeCode(
    [
      data.intro,
      ...data.scenes.flatMap((s) => [s.text, ...s.hints]),
      ...data.views.map((v) => v.text),
      ...data.puzzles.map((p) => p.doc.meta.result),
      ...data.locks.map((l) => l.prompt),
    ]
      .filter((t) => t !== undefined)
      .join("\n"),
  );
  for (const lock of data.locks) if (!texts.includes(normalizeCode(lock.code))) problems.push({ code: "lock-code-hidden", id: lock.id });

  let result = search(data, limits.maxStates, null);
  const exact = !result.aborted;
  if (!exact) {
    const risky = new Set(data.scenes.flatMap((s) => s.spots.flatMap((spot) => spot.when.filter((c) => !c.on).map((c) => c.flag))));
    result = search(data, limits.maxStates, risky);
  }
  if (result.aborted) {
    problems.push({ code: "aborted" });
    return { status: "aborted", steps: null, deadEnds: null, problems };
  }

  const winnable = result.winAt !== null;
  const deadEnds = !exact ? null : winnable ? countDeadEnds(result) : 0;
  if (!winnable) problems.push({ code: "unwinnable" });
  if (deadEnds !== null && deadEnds > 0) problems.push({ code: "dead-end" });

  const { seen } = result;
  for (const scene of data.scenes) {
    if (!seen.scenes.has(scene.id)) problems.push({ code: "scene-unreachable", id: scene.id });
    else for (const spot of scene.spots) if (!seen.spots.has(`${scene.id}/${spot.id}`)) problems.push({ code: "spot-unreachable", id: `${scene.id}/${spot.id}` });
  }
  for (const p of data.puzzles) if (!seen.puzzles.has(p.id)) problems.push({ code: "puzzle-unreachable", id: p.id });
  for (const l of data.locks) if (!seen.locks.has(l.id)) problems.push({ code: "lock-unreachable", id: l.id });
  for (const v of data.views) if (!seen.views.has(v.id)) problems.push({ code: "view-unreachable", id: v.id });
  for (const f of data.flags) if (!seen.flags.has(f.id)) problems.push({ code: "flag-unused", id: f.id });

  return { status: winnable ? "winnable" : "unwinnable", steps: exact ? result.winAt : null, deadEnds, problems };
}
