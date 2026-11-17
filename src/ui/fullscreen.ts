// Full screen while playing (M41): the browser's own full screen (Fullscreen API, hides the address bar and system bars)
// and keeping the screen on (Screen Wake Lock API). Both are optional: where the browser lacks them (the iPhone has no
// full screen for page elements), nothing happens and the app's full screen view works on its own.

/** The browser could hide its bars and does not yet. */
export function canHideBrowserBars(): boolean {
  return document.fullscreenEnabled === true && document.fullscreenElement === null;
}

/** Only in a user gesture (a tap, a key press): otherwise the browser refuses. */
export function hideBrowserBars(): void {
  if (!canHideBrowserBars()) return;
  document.documentElement
    .requestFullscreen({ navigationUI: "hide" })
    .then(lockEscape)
    .catch((error: unknown) => console.warn("fullscreen", error));
}

/** The Keyboard Lock API (Chrome, Edge); not yet in TypeScript's DOM types. */
type KeyboardLock = { lock(codes?: string[]): Promise<void>; unlock(): void };

function keyboardLock(): KeyboardLock | null {
  const keyboard = (navigator as Navigator & { keyboard?: Partial<KeyboardLock> }).keyboard;
  return typeof keyboard?.lock === "function" && typeof keyboard.unlock === "function" ? (keyboard as KeyboardLock) : null;
}

/**
 * In the browser's full screen, Escape leaves it before the page sees the key, so a keyboard move in Klotski or
 * Rush Hour could not be cancelled. Locked, Escape reaches the page, and holding it leaves the full screen (the
 * browser shows that hint itself). Where the API is missing, Escape keeps leaving at once.
 */
function lockEscape() {
  keyboardLock()?.lock(["Escape"]).catch((error: unknown) => console.warn("keyboard lock", error));
}

export function showBrowserBars(): void {
  keyboardLock()?.unlock();
  if (document.fullscreenElement) document.exitFullscreen().catch((error: unknown) => console.warn("fullscreen", error));
}

/** `onLeave` runs when the browser leaves its full screen, also by itself (Escape, the system's back gesture). */
export function watchBrowserFullscreen(onLeave: () => void, onChange: () => void): void {
  document.addEventListener("fullscreenchange", () => {
    onChange();
    if (document.fullscreenElement !== null) return;
    keyboardLock()?.unlock();
    onLeave();
  });
}

let wanted = false;
let lock: WakeLockSentinel | null = null;
let requesting = false;

/**
 * Keeps the screen on while `on` (e.g. a tablet in an escape room). Cheap to call after every render. The browser
 * releases the lock when the page is hidden; it is taken again when the page comes back.
 */
export function keepScreenOn(on: boolean): void {
  if (on === wanted) return;
  wanted = on;
  if (on) void acquire();
  else release();
}

async function acquire() {
  if (lock || requesting || !wanted || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  requesting = true;
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      if (lock === sentinel) lock = null;
    });
    lock = sentinel;
    if (!wanted) release(); // switched off while asking
  } catch (error) {
    console.warn("wake lock", error); // e.g. battery saver; the screen just turns off as usual
  } finally {
    requesting = false;
  }
}

function release() {
  const current = lock;
  lock = null;
  current?.release().catch(() => {});
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => void acquire());
}
