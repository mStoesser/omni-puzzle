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
  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch((error: unknown) => console.warn("fullscreen", error));
}

export function showBrowserBars(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch((error: unknown) => console.warn("fullscreen", error));
}

/** `onLeave` runs when the browser leaves its full screen, also by itself (Escape, the system's back gesture). */
export function watchBrowserFullscreen(onLeave: () => void, onChange: () => void): void {
  document.addEventListener("fullscreenchange", () => {
    onChange();
    if (document.fullscreenElement === null) onLeave();
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
