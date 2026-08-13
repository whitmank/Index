// Authored by Karter Whitman using Claude Opus 5
// Everything that can speak about a resource, and the order they are
// heard in.
//
// There are two sources today and they are not peers. A file's own
// metadata is written by the tool that produced the file; a filename is
// written by a person or an archive about the work. Where they disagree
// the name wins — which sounds backwards until you meet a book whose
// only internal date is when somebody re-wrapped the scan, and whose
// filename carries the publication year, the publisher and the isbn
// (signals/filename.ts has that story).
//
// Precedence needs no machinery: `toFields` takes the first unclaimed
// match, so the order of this array *is* the order of authority. What it
// does need is `settle` — see below, and do not remove it.
import type { Observation } from "./extract.js";
import { extractBook } from "./formats/book.js";
import { extractPdf, PDF_MIME } from "./formats/pdf.js";
import { fromFilename } from "./signals/filename.js";
import { EPUB_MIME, type Probe } from "./probe.js";

type Reader = (probe: Probe) => Promise<Observation[]>;

/**
 * Readers, keyed by what the bytes are.
 *
 * Keyed by media type and not by type, which is a correction this table
 * has already had to make once. A `book` arrives as an epub or as a pdf
 * and neither reader can read the other's bytes, while one pdf reader
 * serves a book, a paper and a receipt alike — so how a file is read is
 * a fact about the file, and the only thing that could decide it.
 *
 * Whether a file is worth opening at all is a different question, asked
 * by the type gate in `extract`. Keeping the two apart is what lets a
 * type nobody here has heard of — a user's `textbook`, `monograph`,
 * `zine` — still be filled in from the file it points at. Before this,
 * extraction fired only for the three types the classifier itself
 * invents, so naming your own type quietly turned it off.
 *
 * A media type with no reader is not a failure; it is a file with
 * nothing to say in a vocabulary this ingestor knows.
 */
const READERS: Record<string, Reader> = {
  [EPUB_MIME]: extractBook,
  [PDF_MIME]: extractPdf,
};

/** What the bytes themselves say, whatever they turn out to be. */
export async function observe(probe: Probe): Promise<Observation[]> {
  const reader = READERS[(await probe.mime()) ?? ""];
  return reader ? reader(probe) : [];
}

/**
 * One observation per key, the first to speak keeping it.
 *
 * Without this, two sources naming the same thing produce a *duplicate
 * row* rather than a contest: the schema's `title` field claims the
 * filename's title, and the file's own title — now unmatched — survives
 * as a loose row beside it. The bug is invisible in any test with one
 * source in it, which is every test that existed before there were two.
 *
 * Compared on the normalised key, so `published` from one source and
 * `Published` from another are the same claim.
 */
function settle(observations: Observation[]): Observation[] {
  const heard = new Set<string>();
  return observations.filter((observation) => {
    const key = observation.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (heard.has(key)) return false;
    heard.add(key);
    return true;
  });
}

/**
 * Everything known about the resource behind this probe, in order of
 * authority. Adding a source is adding a line here — the ordering is the
 * whole of the precedence rule, and it belongs somewhere a person can
 * read it in one glance.
 */
export async function observeAll(probe: Probe): Promise<Observation[]> {
  return settle([...fromFilename(probe.uri), ...(await observe(probe))]);
}
