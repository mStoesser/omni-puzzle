// Play time of one attempt (M25): starts with the first move, pauses while the page is hidden and stops when solved.
// Pure: callers pass the current time (Date.now / performance.now), so it is tested without a clock.

export type Timer = {
  readonly started: boolean;
  readonly elapsedMs: number; // accumulated before `since`
  readonly since: number | null; // running since this timestamp; null = idle, paused or stopped
};

export const IDLE_TIMER: Timer = { started: false, elapsedMs: 0, since: null };

/** Starts the attempt; a started timer is returned unchanged. */
export function startTimer(timer: Timer, now: number): Timer {
  return timer.started ? timer : { started: true, elapsedMs: 0, since: now };
}

/** A continued attempt (M36): started, paused with the time so far; the next move lets it run again. */
export function continuedTimer(elapsed: number): Timer {
  return { started: true, elapsedMs: Math.max(0, elapsed), since: null };
}

export function pauseTimer(timer: Timer, now: number): Timer {
  return timer.since === null ? timer : { ...timer, elapsedMs: elapsedMs(timer, now), since: null };
}

/** Continues a started, paused timer. An idle timer waits for the first move. */
export function resumeTimer(timer: Timer, now: number): Timer {
  return timer.started && timer.since === null ? { ...timer, since: now } : timer;
}

export function isRunning(timer: Timer): boolean {
  return timer.since !== null;
}

/** Clock jumps backwards (e.g. a changed system time) never make the time shrink. */
export function elapsedMs(timer: Timer, now: number): number {
  return timer.since === null ? timer.elapsedMs : timer.elapsedMs + Math.max(0, now - timer.since);
}

/** "0:07", "12:34", "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
