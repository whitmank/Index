// Authored by Karter Whitman using Claude Opus 5
// Two things that cannot both be true, recorded rather than resolved.
//
// "Do not hide disagreements" is the spec's instruction (§5), and it is
// the one place this module deliberately produces less than it could. A
// reconciler that always picks a winner is easy to write and looks better
// in a demo; it also silently discards the fact that the sources did not
// agree, which is often the most interesting thing the run learned.
//
// A conflict is not a failure. The Item comes back valid, with the
// incumbent value untouched, and the disagreement attached for a UI to
// offer as a choice later.
import type { FieldProvenance } from "./provenance.js";

export interface ConflictSide {
  value: string | string[];
  provenance: FieldProvenance;
}

export interface ModelingConflict {
  field: string;
  /** What the Item currently says, and who put it there. For a user
   * value the origin is `user`; for a modeled one it is whatever last
   * won. */
  incumbent: ConflictSide;
  /** The claims that disagree with it, best first. More than one when
   * several sources each say something different again. */
  challengers: ConflictSide[];
  /** Why this counted as material disagreement rather than two spellings
   * of one fact — normalization ran first, so reaching here means the
   * values really differ. */
  reason: string;
}

