// Sounds and vibration while playing (M39). Pure: which feedback a move gets, and what it sounds and feels like.
// ui/feedback.ts plays it with Web Audio and navigator.vibrate, only if the player switched it on (default off).

export type Feedback = "move" | "invalid" | "solved";

/**
 * The feedback for a dispatched move, from the session before and after: a rejected move keeps the same session
 * (session.dispatch). Nothing for taps on a solved puzzle.
 */
export function moveFeedback(before: { solved: boolean }, after: { solved: boolean }): Feedback | null {
  if (after === before) return before.solved ? null : "invalid";
  return after.solved && !before.solved ? "solved" : "move";
}

/** One tone: frequency in Hz, start and length in seconds, peak volume (0–1, kept low). */
export type Tone = { freq: number; at: number; duration: number; wave: "sine" | "triangle"; volume: number };

/** Quiet and short: a soft click, a low bump, a rising C major arpeggio. */
export const SOUNDS: Readonly<Record<Feedback, readonly Tone[]>> = {
  move: [{ freq: 880, at: 0, duration: 0.05, wave: "sine", volume: 0.08 }],
  invalid: [{ freq: 196, at: 0, duration: 0.12, wave: "triangle", volume: 0.12 }],
  solved: [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({ freq, at: i * 0.09, duration: i === 3 ? 0.35 : 0.12, wave: "sine" as const, volume: 0.1 })),
};

/** Vibration patterns in ms (vibrate, pause, vibrate …). */
export const VIBRATIONS: Readonly<Record<Feedback, readonly number[]>> = {
  move: [8],
  invalid: [30, 40, 30],
  solved: [40, 60, 40, 60, 120],
};

/** Rejected moves can come in a burst (dragging against a wall); one bump per this many ms is enough. */
export const INVALID_INTERVAL_MS = 300;
