// Authored by Karter Whitman using Claude Opus 4.8
// A month grid for jumping to a day. Days that have members are marked,
// so the calendar shows where the set actually is (PRODUCT-SPEC §3.4);
// days after `max` are not selectable.
//
// Dates are built from local-time parts and never by parsing a string as
// a Date, which would read it as UTC midnight and shift the day in
// negative-offset zones.
import { useEffect, useRef, useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarPopover({
  selected,
  max,
  marked,
  onSelect,
  onClose,
}: {
  selected: string;
  /** The furthest-forward selectable day. */
  max: string;
  /** The days with members. */
  marked: ReadonlySet<string>;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedYear, selectedMonth] = selected.split("-").map(Number);
  const [view, setView] = useState({
    year: selectedYear ?? new Date().getFullYear(),
    month: selectedMonth ?? new Date().getMonth() + 1,
  });

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const { year, month } = view;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Leading blanks so the 1st lands under its weekday, then the days.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  function step(delta: number): void {
    setView((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  }

  return (
    <div className="calendar" ref={ref}>
      <header className="calendar-head">
        <button onClick={() => step(-1)} type="button">
          ‹
        </button>
        <span>
          {MONTHS[month - 1]} {year}
        </span>
        <button onClick={() => step(1)} type="button">
          ›
        </button>
      </header>

      <div className="calendar-grid">
        {WEEKDAYS.map((weekday, index) => (
          <span className="calendar-weekday" key={`${weekday}${index}`}>
            {weekday}
          </span>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <span key={`blank${index}`} />;
          const date = iso(year, month, day);
          const classes = [
            "calendar-day",
            date === selected ? "is-selected" : "",
            marked.has(date) ? "has-members" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              className={classes}
              disabled={date > max}
              key={date}
              onClick={() => {
                onSelect(date);
                onClose();
              }}
              type="button"
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
