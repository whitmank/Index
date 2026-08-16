// Authored by Karter Whitman using Claude Opus 4.8
//
// UNUSED — parked, not deleted. This was the timeline view: a set's
// members partitioned by date into pages you slide between (PRODUCT-SPEC
// §3.4), and `~`'s home behavior. Per a later product decision, how you
// view a set (canvas/list) is now one global, application-level toggle
// rather than a property remembered per set, and the timeline/day-paging
// idea was pulled out of the active UI surface entirely rather than
// folded into that toggle — it reads as more of a "ground yourself in
// today's date" home concept than a third view kind. Extracted here
// (renamed Timeline → Calendar) in case that home concept comes back in
// its own right later. Not imported anywhere; App.tsx no longer renders
// it, and its CSS is no longer loaded.
//
// Each page is a canvas of that day's members, so placing something on a
// day page is the same gesture, and writes the same arrow, as placing it
// anywhere else.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item } from "@index/database/types";
import { CalendarPopover } from "../../components/CalendarPopover.tsx";
import { useDayPager } from "../../hooks/useDayPager.js";
import { adjacentDate, readableDate, todayISO } from "../../lib/dates.js";
import type { DescribePrompt } from "../../lib/intake.js";
import { loadSet, loadSetDates, pool, usePool } from "../../store/index.js";
import { Canvas } from "../canvas/Canvas.tsx";
import { DayPager } from "./DayPager.tsx";

export interface CalendarProps {
  setId: string;
  /** The shell's one navigation primitive. */
  onGoTo: (item: Item, isNew?: boolean) => void;
  /** The "what is this?" prompt, threaded down to every day's canvas. */
  describe: DescribePrompt;
}

export function Calendar({ setId, onGoTo, describe }: CalendarProps) {
  const today = useMemo(() => todayISO(), []);
  const [selected, setSelected] = useState(today);
  const [populated, setPopulated] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<string, string[]>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);

  const pager = useDayPager(selected, setSelected, today, populated);

  const refreshDates = useCallback(async () => {
    setPopulated(await loadSetDates(setId));
  }, [setId]);

  /** Who holds an arrow into this set — see the shell for why the pages
   * follow it. A day can empty out or fill up when this changes, so the
   * marked dates are read again with them. */
  const membership = usePool(() =>
    pool
      .arrowsInto(setId)
      .map((arrow) => arrow.source)
      .sort()
      .join(" "),
  );

  useEffect(() => {
    void refreshDates();
  }, [refreshDates, membership]);

  /** Load one day's page into the pool and remember its member order. */
  const loadPage = useCallback(
    async (date: string) => {
      const ids = await loadSet(setId, { partition: { date } });
      setPages((current) => ({ ...current, [date]: ids }));
    },
    [setId],
  );

  // The centred page, then the two the pager could turn to — prefetched
  // so a turn never waits on a read.
  useEffect(() => {
    void loadPage(selected);
    const ahead = adjacentDate(populated, selected, 1, today);
    const behind = adjacentDate(populated, selected, -1, today);
    if (ahead) void loadPage(ahead);
    if (behind) void loadPage(behind);
    // `membership` is a dependency, not a value read here: a change to
    // who is in the set is a change to what these pages contain.
  }, [selected, populated, today, loadPage, membership]);

  // ← and → turn the page, unless the user is typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") pager.step(-1);
      else if (event.key === "ArrowRight") pager.step(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pager]);

  // A new item on a day the set didn't have yet has to join the marked
  // dates, or the page becomes unreachable the moment you leave it.
  useEffect(() => {
    const ids = pages[selected];
    if (ids && ids.length > 0 && !populated.includes(selected)) void refreshDates();
  }, [pages, selected, populated, refreshDates]);

  const marked = useMemo(() => new Set(populated), [populated]);

  const renderDay = useCallback(
    (date: string, isActive: boolean) => (
      <section className="page">
        <header className="page-head">
          <h2>{readableDate(date, today)}</h2>
          <span className="page-date">{date}</span>
        </header>
        <div className="page-body">
          <Canvas
            active={isActive}
            date={date}
            describe={describe}
            itemIds={pages[date] ?? []}
            key={date}
            onGoTo={isActive ? onGoTo : () => undefined}
            // Leaving the set can also empty the day, so the marked dates
            // are read again with it — a page nobody can reach is worse
            // than a stale one.
            onMembersChanged={() => {
              void loadPage(date);
              void refreshDates();
            }}
            setId={setId}
          />
        </div>
      </section>
    ),
    [pages, onGoTo, setId, today, loadPage, refreshDates, describe],
  );

  return (
    <div className="timeline">
      <nav className="timeline-nav">
        <button disabled={!pager.canStepOlder()} onClick={() => pager.step(-1)} type="button">
          ‹
        </button>
        <button
          aria-label="Jump to a day"
          className="timeline-pick"
          onClick={() => setCalendarOpen((open) => !open)}
          title="Jump to a day"
          type="button"
        >
          ▦
        </button>
        <button disabled={!pager.canStepNewer()} onClick={() => pager.step(1)} type="button">
          ›
        </button>

        {calendarOpen && (
          <CalendarPopover
            marked={marked}
            max={today}
            onClose={() => setCalendarOpen(false)}
            onSelect={pager.goTo}
            selected={selected}
          />
        )}
      </nav>

      <DayPager
        animating={pager.animating}
        currentDate={selected}
        max={today}
        offset={pager.offset}
        onTransitionEnd={pager.handleTransitionEnd}
        populatedDates={populated}
        renderDay={renderDay}
        viewportRef={pager.viewportRef}
      />
    </div>
  );
}
