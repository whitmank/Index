// Authored by Karter Whitman using Claude Opus 5
// One source, normalised into something every reader can use the same way.
//
// The spec asks for evidence collection to produce "an internal evidence
// representation" that downstream components consume consistently, and
// this is it. The important property is that it is a *handle*, not a
// snapshot: a snapshot has to decide up front how deep to read, which
// means either parsing every archive it meets or under-serving whoever
// needed the parse and watching them open the file again.
//
// Reading it off the interface instead: `head` is bounded and already
// paid, `tail()` is a second bounded read, and `bytes()` — the one that
// could hold tens of megabytes — is reached only by a reader that has
// established the source is worth loading, and refuses outright above
// `MAX_WHOLE_FILE_BYTES`.
export interface SourceEvidence {
  /** Stable within a run and derived from the resource's position and
   * uri, so provenance can name a source and a reader of the result can
   * find it again on the Item. */
  sourceId: string;
  uri: string;
  /** What the resource is called on the Item — a filename, or a url's
   * host and path. The filename reader's entire input. */
  name: string;
  /** Its place in `Item.resources`. 0 is the primary resource, which
   * outranks the rest: the primary is what the user said the item *is*. */
  position: number;
  kind: "file" | "web";
  /** What the bytes declare themselves to be, sniffed rather than taken
   * from an extension or a Content-Type header — both of which lie, and
   * the second more often than the first. Null when nothing matched. */
  mime: string | null;
  size: number;
  head: Buffer;
  /** True when the source was longer than the limits allow, so a reader
   * that found nothing knows the difference between "it does not say"
   * and "we did not look that far". Surfaces as a `source-truncated`
   * warning. */
  truncated: boolean;
  /**
   * The identity of this source's *content*, for idempotency. Cheap by
   * construction — the head, the tail and the size — so computing it
   * never costs a full read. Two runs over an unchanged file agree; an
   * edited file does not.
   */
  fingerprint: string;

  tail(): Promise<Buffer>;
  /** The whole source, or null when it is too large to hold. A reader
   * that needs it must handle the null; that is the price of the bound. */
  bytes(): Promise<Buffer | null>;
  /** Readable text, capped by `maxSourceTextLength`. For a file this is
   * the head decoded; for a page it is the body. */
  text(): Promise<string>;
}

/** Runs `work` once and hands every later caller the same promise, so
 * two readers asking the same source for its bytes read it once. */
export function once<T>(work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= work());
}

export function sourceIdFor(position: number, uri: string): string {
  return `s${position}:${uri}`;
}
