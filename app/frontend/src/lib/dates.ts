// Authored by Karter Whitman using Claude Opus 4.8
// Dates are ISO `YYYY-MM-DD` strings throughout, so lexical order is
// chronological order and no timezone ever enters the data. These helpers
// exist to keep the conversion between a local clock and that string in
// exactly one place.
import type { DatePrecision } from "@index/database/types";

/** Today, by the local clock — the journal sense of "today". */
export function today(): string {
  return toISODate(new Date());
}

export function toISODate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function fromISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

export function shiftDays(date: string, days: number): string {
  const shifted = fromISODate(date);
  shifted.setDate(shifted.getDate() + days);
  return toISODate(shifted);
}

/**
 * The next stop in `direction` from `current` for a page turn — the
 * nearest date in `dates` (ascending; the days that actually have
 * members) beyond `current`, so empty pages are never landed on.
 *
 * Going newer, `max` (today) is always a valid stop even with nothing on
 * it: it is where new items get added, so it is the one day exempt from
 * the skip. Going older there is no such floor — null means there is
 * nothing earlier to turn to. This governs only *landing spots*;
 * `current` itself is never required to have members.
 *
 * Ported from kwhitman.xyz, where these rules are settled.
 */
export function adjacentDate(
  dates: string[],
  current: string,
  direction: 1 | -1,
  max: string,
): string | null {
  if (direction === 1) {
    const next = dates.find((date) => date > current && date <= max);
    if (next !== undefined) return next;
    return current < max ? max : null;
  }
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const candidate = dates[index];
    if (candidate !== undefined && candidate < current) return candidate;
  }
  return null;
}

/** How a date reads in a page header. */
export function readableDate(date: string, today = todayISO()): string {
  if (date === today) return "today";
  if (date === shiftDays(today, -1)) return "yesterday";
  return fromISODate(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: fromISODate(date).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Today, by the local clock. An alias kept because the pager reads more
 * clearly with it. */
export function todayISO(): string {
  return today();
}

/** A stored date, trimmed to a schema attribute's declared precision — the
 * full `YYYY-MM-DD` underneath is never touched, only what's shown. Absent
 * precision means the full date, same as always. */
export function formatByPrecision(date: string, precision?: DatePrecision): string {
  if (!date) return date;
  if (precision === "year") return date.slice(0, 4);
  if (precision === "month") return date.slice(0, 7);
  return date;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "23rd", "1st", "12th" — the day-of-month word an English date reads
 * with, which neither `toLocaleDateString` nor `Intl` will spell out. */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

/** A full stored date, spelled the way a person would say it — "2021,
 * April 23rd" — for wherever the exact value is worth reading rather
 * than scanning (DateValueInput.tsx's hover reveal). Editing a date
 * still works in the plain ISO string underneath; this is a reading, not
 * an input format. */
export function formatDateEnglish(date: string): string {
  if (!date) return date;
  const parsed = fromISODate(date);
  const month = MONTH_NAMES[parsed.getMonth()];
  if (!month) return date;
  return `${parsed.getFullYear()}, ${month} ${ordinal(parsed.getDate())}`;
}

/** A schema attribute's on-screen word, matched to what it actually shows
 * rather than what it's keyed by — "Date" reads as "Year" once its
 * precision has trimmed it down to one, the same way `formatByPrecision`
 * trims the value beside it. `attribute` itself stays the storage key and
 * the schema's own name for the field; this only ever touches the label,
 * and only where the word "date" is literally in it — a field with some
 * other name (e.g. "Published") is left alone rather than guessed at. */
export function dateFieldLabel(attribute: string, precision?: DatePrecision): string {
  const word = precision === "year" ? "Year" : precision === "month" ? "Month" : null;
  if (!word) return attribute;
  return attribute.replace(/\bdate\b/i, word);
}
