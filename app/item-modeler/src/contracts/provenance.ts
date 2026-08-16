// Authored by Karter Whitman using Claude Opus 5
// Where a value came from, recorded at the moment it was read.
//
// Provenance is the spec's central demand (§Ground every modeled field):
// every modeled value must be traceable to evidence, and a value the
// module cannot explain is invalid however plausible it reads. So this
// shape is not decoration on a claim — it is the thing that makes the
// claim admissible, and it is attached at birth by whichever reader
// produced the value rather than reconstructed later.
//
// It rides in the modeling *result* rather than on the Item. `Item` has
// nowhere to keep it — `@index/database/types` records a field's name,
// value and kind and nothing about who decided — and this pass does not
// touch the schema. Persisting it is the cutover pass's decision, once
// there is a real shape to store.

/**
 * Who decided. The four the spec names, and the distinction that matters
 * most is `user` against everything else: a user value is never
 * overwritten, only confirmed or conflicted (application/ownership-policy).
 *
 * `language-model` has no producer yet — the local extraction model is
 * named project scope but deliberately deferred until the deterministic
 * layer has been measured. It is in the union because a claim's origin is
 * the field the ownership and ranking rules branch on, and leaving the
 * member out would mean revisiting every one of those branches later. A
 * union member costs nothing; an empty folder would have.
 */
export type Origin = "user" | "deterministic" | "rule" | "language-model";

/** Which model produced a value, and under which prompt. A value's
 * meaning depends on what the model was asked, so an audit trail that
 * cannot name the prompt version cannot explain its own contents. */
export interface ModelIdentity {
  name: string;
  quantization: string;
  promptVersion: string;
}

/**
 * How a value was obtained, in enough detail to reproduce the read.
 * Free-form by design — a reader names its own method, and nothing
 * matches on the string. It exists to be read by a person looking at a
 * change set and asking why a field says what it says.
 */
export type ExtractionMethod =
  /** Transcribed from an epub's package document, which the format
   * requires and which describes the work. */
  | "epub-opf"
  /** Settled by arithmetic — an identifier whose check digit verifies. */
  | "checksum"
  /** Synthesised by the local extraction model across the whole basket. */
  | "language-model"
  | "user-entered"
  | (string & {});

export interface FieldProvenance {
  origin: Origin;
  /** Every source that supports this value. More than one when
   * reconciliation merged agreeing claims — agreement is evidence, and
   * collapsing it to a single winner would throw that away. */
  sourceIds: string[];
  /**
   * Where inside the source, in that source's own addressing:
   * `pdf:Info/Title`, `xmp:dc:creator`, `opf:dc:date`, `filename:shape`.
   * Precise enough to go back and look.
   */
  location?: string;
  method: ExtractionMethod;
  /** Set on a model-derived value. Absent on a transcribed one. */
  model?: ModelIdentity;
  /**
   * The span the value was drawn from. Kept short — this is a citation,
   * not a copy of the source, and it must never become a channel for
   * dumping document text into logs or results.
   */
  excerpt?: string;
  /**
   * 0–1. On a transcribed fact this is 1: the file said so. On a
   * model-derived value it is the **grounding support** — the share of
   * the value's significant tokens actually found in the evidence
   * (validation/validate-provenance.ts) — so it is a measured quantity
   * rather than the model's opinion of itself.
   */
  confidence?: number;
  /** ISO 8601. When the value was set or last confirmed. */
  at: string;
}
