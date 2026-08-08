// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz, where the thresholds are settled.
//
// Recognises a horizontal two-finger scroll over an element as a single
// directional swipe. Knows nothing about what a swipe *does* — it reports
// a direction, once per gesture. Everything else (the momentum tail, the
// rest of the same swipe) is swallowed until scrolling pauses.
import { useEffect, useRef, type RefObject } from "react";

/** A small floor so trackpad jitter can't count as a swipe; a real
 * gesture crosses it on its first event, so recognition stays immediate. */
const SWIPE_TRIGGER_PX = 30;

/** One physical swipe = one report. After firing, further events are
 * ignored until wheel activity stops for this long — that lull is what
 * separates one gesture (and its momentum tail) from the next. */
const GESTURE_END_MS = 30;

export interface SwipeOptions {
  /** Whether a new swipe may begin right now — false while a page is
   * mid-transition. Read live on every event. */
  enabled: () => boolean;
  /** Once per recognised gesture. +1 = scrolled toward the right
   * (fingers left), -1 = toward the left. */
  onSwipe: (direction: 1 | -1) => void;
}

export function useSwipeGesture(
  targetRef: RefObject<HTMLElement | null>,
  { enabled, onSwipe }: SwipeOptions,
): void {
  // Latest callbacks via refs, so the wheel listener binds exactly once.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;

    let accumulated = 0;
    let locked = false;
    let endTimer: ReturnType<typeof setTimeout> | undefined;

    function onWheel(event: WheelEvent): void {
      // Not our gesture if it is mostly vertical; let the page have it.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      // Claim it, so the browser can't read it as a history back-swipe.
      event.preventDefault();

      // Hold the gesture open until scrolling — momentum included — stops.
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        locked = false;
        accumulated = 0;
      }, GESTURE_END_MS);

      // Already reported this gesture, or recognition is off: swallow the
      // remainder until the gesture ends and re-enables.
      if (locked || !enabledRef.current()) return;

      accumulated += event.deltaX;
      if (Math.abs(accumulated) < SWIPE_TRIGGER_PX) return;

      const direction = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      locked = true;
      onSwipeRef.current(direction);
    }

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(endTimer);
    };
  }, [targetRef]);
}
