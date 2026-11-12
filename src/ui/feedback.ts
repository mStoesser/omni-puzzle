// Plays the feedback of core/feedback.ts (M39): tones made with Web Audio (no audio files) and navigator.vibrate.
// Both may be missing (iOS has no vibrate, some browsers no AudioContext); then nothing happens, without an error.

import { INVALID_INTERVAL_MS, SOUNDS, VIBRATIONS } from "../core/feedback.ts";
import type { Feedback, Tone } from "../core/feedback.ts";

let audio: AudioContext | null = null;
let lastInvalid = -Infinity;

function context(): AudioContext | null {
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audio = new Ctor();
  } catch {
    return null;
  }
  return audio;
}

/**
 * Creates or resumes the audio context. Browsers (iOS above all) allow that only during a user gesture, and a move
 * may come from a pointerdown, which is not one there: so this also runs on pointerup and keydown (main.ts).
 */
export function unlockAudio() {
  const ctx = context();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

export function giveFeedback(kind: Feedback) {
  if (kind === "invalid") {
    const now = performance.now();
    if (now - lastInvalid < INVALID_INTERVAL_MS) return;
    lastInvalid = now;
  }
  try {
    navigator.vibrate?.([...VIBRATIONS[kind]]);
  } catch {
    // not allowed (e.g. in a frame) or not supported
  }
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.01;
  for (const tone of SOUNDS[kind]) play(ctx, tone, start);
}

function play(ctx: AudioContext, tone: Tone, start: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const begin = start + tone.at;
  const end = begin + tone.duration;
  osc.type = tone.wave;
  osc.frequency.value = tone.freq;
  // A short fade in and an exponential fade out: no clicks at the edges.
  gain.gain.setValueAtTime(0.0001, begin);
  gain.gain.exponentialRampToValueAtTime(tone.volume, begin + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(ctx.destination);
  osc.start(begin);
  osc.stop(end + 0.02);
}
