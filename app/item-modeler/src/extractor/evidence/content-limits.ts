// Authored by Karter Whitman using Claude Opus 5
// Every bound the module reads under, in one place a person can check.
//
// The point of fixed limits is that cost stops depending on the file. A
// 400 MB scan and a 400 KB paper are read for the same number of bytes,
// so "model this item" has a knowable price and cannot be made expensive
// by what somebody dropped on it.

/** Enough for a zip's first local header and a document's opening
 * section — what identification needs, and no more. */
export const HEAD_BYTES = 64 * 1024;

/**
 * Some formats keep their self-description at the *end*, which a head
 * can never reach: a PDF's trailer points at everything the file says
 * about itself. Bigger than the head because the objects the trailer
 * points at trail behind it, and generous enough to catch a producer
 * that wrote its metadata a few objects earlier — but still fixed, so
 * the far end of a half-gigabyte file costs a quarter megabyte.
 */
export const TAIL_BYTES = 256 * 1024;

/** Link and meta tags live in a page's <head>, so the rest is never
 * needed and an enormous page cannot hang a run. */
export const WEB_MAX_BYTES = 1_000_000;

/** A whole-file read is refused above this. Nothing the deterministic
 * readers do needs more, and buffering a video into the main process is
 * how an app stops responding. */
export const MAX_WHOLE_FILE_BYTES = 64 * 1024 * 1024;

/** How long any single source may take to read. */
export const SOURCE_TIMEOUT_MS = 10_000;

/** Provenance excerpts are citations, not copies. Long enough to locate
 * the value, short enough that no result becomes a channel for dumping
 * document text. */
export const EXCERPT_MAX = 200;

export function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= EXCERPT_MAX ? flat : `${flat.slice(0, EXCERPT_MAX - 1)}…`;
}
