// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz.
//
// A three-wide filmstrip — the nearest populated day behind, the current
// day, the nearest populated day ahead (or today) — held one viewport
// width apart, so empty days are never even mounted as a pane to slide
// past. The track sits centred on the middle pane and slides by `offset`
// as you turn; keying each pane by its date means a committed neighbour
// is the *same* element before and after the swap, so the turn lands
// without a repaint or a rebuilt canvas.
import type { ReactNode, RefObject, TransitionEvent } from "react";
import { adjacentDate } from "../../lib/dates.js";

export interface DayPagerProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  currentDate: string;
  /** The newest reachable day — today, for a set that walks forward. */
  max: string;
  /** The dates with members, ascending. */
  populatedDates: string[];
  offset: number;
  animating: boolean;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
  /** Renders one day's pane; `isActive` marks the centred, interactive one. */
  renderDay: (date: string, isActive: boolean) => ReactNode;
}

export function DayPager({
  viewportRef,
  currentDate,
  max,
  populatedDates,
  offset,
  animating,
  onTransitionEnd,
  renderDay,
}: DayPagerProps) {
  const previous = adjacentDate(populatedDates, currentDate, -1, max);
  const next = adjacentDate(populatedDates, currentDate, 1, max);

  // While turning, no pane takes input — a peek isn't a click.
  const busy = animating || offset !== 0;
  const trackClass =
    "pager-track" + (animating ? " is-animating" : "") + (busy ? " is-busy" : "");

  return (
    <div className="pager-viewport" ref={viewportRef}>
      <div
        className={trackClass}
        onTransitionEnd={onTransitionEnd}
        style={{ transform: `translateX(calc(-100% - ${offset}px))` }}
      >
        {previous !== null ? (
          <div className="pager-pane" key={previous}>
            {renderDay(previous, false)}
          </div>
        ) : (
          // A placeholder keeps the centre pane in the middle slot when
          // there is no earlier populated day to show.
          <div aria-hidden className="pager-pane" key="no-previous" />
        )}

        <div className="pager-pane is-current" key={currentDate}>
          {renderDay(currentDate, true)}
        </div>

        {next !== null ? (
          <div className="pager-pane" key={next}>
            {renderDay(next, false)}
          </div>
        ) : (
          <div aria-hidden className="pager-pane" key="no-next" />
        )}
      </div>
    </div>
  );
}
