// Play settings per device (M34), in localStorage like theme and language.

/** "hidden" hides the running time while playing; it is still measured (best time, leaderboards). */
export const TIMER_KEY = "knobelkiste-timer";

export function parseShowTimer(value: string | null): boolean {
  return value !== "hidden";
}

export function readShowTimer(): boolean {
  try {
    return parseShowTimer(localStorage.getItem(TIMER_KEY));
  } catch {
    return true;
  }
}

export function storeShowTimer(show: boolean) {
  try {
    if (show) localStorage.removeItem(TIMER_KEY);
    else localStorage.setItem(TIMER_KEY, "hidden");
  } catch {
    // private mode without storage: the choice lasts until the page is closed
  }
}
