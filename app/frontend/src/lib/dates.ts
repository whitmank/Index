// Authored by Karter Whitman using Claude Opus 4.8
// Dates are ISO `YYYY-MM-DD` strings throughout, so lexical order is
// chronological order and no timezone ever enters the data. These helpers
// exist to keep the conversion between a local clock and that string in
// exactly one place.

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
