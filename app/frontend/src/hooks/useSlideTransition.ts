// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz.
//
// The horizontal slide underneath a filmstrip pager. It owns only the
// motion: an `offset` (px off-centre) and an `animating` flag that
// together drive the track's transform and CSS transition. `slide(dir)`
// runs one animated turn; when it lands, it re-centres and calls
// `onCommit(dir)` — in the same React commit, so the arriving pane
// doesn't flinch — leaving *what a turn means* entirely to the caller.
import { useCallback, useRef, useState, type RefObject, type TransitionEvent } from "react";

/** Comfortably longer than the CSS transition: a safety net that
 * finalises a slide even if its transitionend never arrives (a coalesced
 * or cancelled transition can skip the event), so the pager cannot wedge
 * with input blocked. */
const SLIDE_FALLBACK_MS = 400;

export function useSlideTransition(
  viewportRef: RefObject<HTMLElement | null>,
  onCommit: (direction: number) => void,
) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const offsetRef = useRef(0);
  const animatingRef = useRef(false);
  /** The direction the running slide will commit to on landing (0 = none). */
  const directionRef = useRef(0);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const width = () => viewportRef.current?.clientWidth ?? window.innerWidth;

  // The single writer for both the ref and the rendered state, so a
  // synchronous read and the next paint never disagree.
  const setTrack = useCallback((px: number, isAnimating: boolean) => {
    offsetRef.current = px;
    animatingRef.current = isAnimating;
    setOffset(px);
    setAnimating(isAnimating);
  }, []);

  // Land the slide: commit the turn, then re-centre with no transition.
  // Both updates batch into one commit, so the pane that just slid in
  // stays put on screen through the swap.
  const settle = useCallback(() => {
    clearTimeout(fallbackRef.current);
    const direction = directionRef.current;
    directionRef.current = 0;
    if (direction !== 0) onCommitRef.current(direction);
    setTrack(0, false);
  }, [setTrack]);

  const slide = useCallback(
    (direction: number) => {
      directionRef.current = direction;
      setTrack(direction === 1 ? width() : -width(), true);
      clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => {
        if (animatingRef.current) settle();
      }, SLIDE_FALLBACK_MS);
    },
    // `width` reads a ref at call time; it needs no dependency of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTrack, settle],
  );

  const handleTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      // Only the track's own transform — not a hover transition bubbling
      // up from content inside a pane.
      if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
      if (!animatingRef.current) return;
      settle();
    },
    [settle],
  );

  /** A live read for callers gating input on whether a turn is in flight. */
  const isAnimating = useCallback(() => animatingRef.current, []);

  return { offset, animating, isAnimating, slide, handleTransitionEnd };
}
