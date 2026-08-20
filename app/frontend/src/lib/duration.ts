// Authored by Karter Whitman using Claude Sonnet 5
// Durations are stored as a plain integer-seconds string throughout — the
// same "one canonical shape, format only on the way out" rule dates.ts
// keeps for ISO dates — so a `duration`-kind value never has to be parsed
// back out of "58:32" or "59 min" to be compared, summed, or queried.

export function secondsToDurationValue(totalSeconds: number): string {
  return String(Math.max(0, Math.round(totalSeconds)));
}

/** The everyday reading: rounded to the nearest minute, "H hr M min" past
 * an hour. What a duration field shows at rest. */
export function formatDurationRounded(value: string): string {
  if (!value) return value;
  const totalMinutes = Math.round((Number(value) || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

/** The exact reading, down to the second — what focusing the field to
 * edit it asks for. */
export function formatDurationPrecise(value: string): string {
  if (!value) return value;
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The inverse of `formatDurationPrecise` — "M:SS", "H:MM:SS", or a bare
 * number read as minutes (what you'd type without reaching for colons).
 * `null` for anything that isn't one of those. */
export function parseDurationInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part.trim()))) return null;

  const numbers = parts.map((part) => Number(part.trim()));
  if (numbers.length === 1) return (numbers[0] ?? 0) * 60;
  if (numbers.length === 2) return (numbers[0] ?? 0) * 60 + (numbers[1] ?? 0);
  return (numbers[0] ?? 0) * 3600 + (numbers[1] ?? 0) * 60 + (numbers[2] ?? 0);
}
