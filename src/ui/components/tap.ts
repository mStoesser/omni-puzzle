// A tap is pointerdown + pointerup on the same element. Pointer events instead of click,
// because touch browsers may delay or swallow clicks (double-tap detection).
// Usage: @pointerdown=${tapStart} @pointerup=${(e) => tapEnd(e) && act()} @pointercancel=${tapCancel}

let pressed: { pointerId: number; target: EventTarget | null } | null = null;

export function tapStart(e: PointerEvent) {
  if (!e.isPrimary || e.button !== 0) return;
  // Touch pointers are implicitly captured by the start element; release so pointerup hits the element under the finger.
  (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  pressed = { pointerId: e.pointerId, target: e.currentTarget };
}

/** True if this pointerup completes a tap that started on the same element. */
export function tapEnd(e: PointerEvent): boolean {
  const tapped = pressed?.pointerId === e.pointerId && pressed.target === e.currentTarget;
  pressed = null;
  return tapped;
}

export function tapCancel() {
  pressed = null;
}
