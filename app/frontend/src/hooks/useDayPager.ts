// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz.
//
// Day navigation for the filmstrip, composed from two lower layers:
// `useSwipeGesture` turns trackpad scrolling into a direction, and
// `useSlideTransition` animates the turn. This layer holds only the
// domain rules — a swipe or an arrow turns to the nearest day with
// members in that direction, skipping empty days entirely; the exception
// is `max` (today), always reachable even when empty. +1 is newer, -1 is
// older.
import { useCallback, useRef } from "react";
import { adjacentDate } from "../lib/dates.js";
import { useSlideTransition } from "./useSlideTransition.js";
import { useSwipeGesture } from "./useSwipeGesture.js";

export function useDayPager(
  selectedDate: string,
  setSelectedDate: (date: string) => void,
  max: string,
  populatedDates: string[],
) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Read live inside stable callbacks, so the layers below bind once.
  const selectedRef = useRef(selectedDate);
  selectedRef.current = selectedDate;
  const maxRef = useRef(max);
  maxRef.current = max;
  const datesRef = useRef(populatedDates);
  datesRef.current = populatedDates;

  /** The day a turn in `direction` lands on, or null if there is nowhere
   * to turn to. */
  const turnTarget = useCallback(
    (direction: 1 | -1) =>
      adjacentDate(datesRef.current, selectedRef.current, direction, maxRef.current),
    [],
  );

  const transition = useSlideTransition(viewportRef, (direction) => {
    const target = turnTarget(direction as 1 | -1);
    if (target !== null) setSelectedDate(target);
  });

  useSwipeGesture(viewportRef, {
    enabled: () => !transition.isAnimating(),
    onSwipe: (direction) => {
      if (turnTarget(direction) === null) return;
      transition.slide(direction);
    },
  });

  /** Programmatic navigation (arrows, calendar): stepping to the pager's
   * logical next or previous day slides through the same turn; anything
   * else — a pick further away, or of a day the turn would have skipped —
   * swaps outright. */
  const goTo = useCallback(
    (date: string) => {
      if (transition.isAnimating()) return;
      if (date === selectedRef.current || date > maxRef.current) return;

      if (date === turnTarget(1)) transition.slide(1);
      else if (date === turnTarget(-1)) transition.slide(-1);
      else setSelectedDate(date);
    },
    [setSelectedDate, transition, turnTarget],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (transition.isAnimating()) return;
      if (turnTarget(direction) === null) return;
      transition.slide(direction);
    },
    [transition, turnTarget],
  );

  return {
    viewportRef,
    offset: transition.offset,
    animating: transition.animating,
    handleTransitionEnd: transition.handleTransitionEnd,
    goTo,
    step,
    canStepOlder: () => turnTarget(-1) !== null,
    canStepNewer: () => turnTarget(1) !== null,
  };
}
