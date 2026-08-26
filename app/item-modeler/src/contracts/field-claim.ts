// Authored by Karter Whitman using Claude Sonnet 5
// A candidate field value — collector's output, composer's input.
//
// SPEC.md's own words: "not yet a final Item update... a candidate
// assertion with evidence and extraction context." Not yet normalized,
// validated, or grounded — composer does all three before anything here
// is written.
//
// This is deliberately the same small shape `resolved-value.ts` describes
// itself as having replaced: that removal was about retiring the
// *arbitration* machinery multi-source claims used to need (a priority
// ladder, a merge rule, a conflict detector), once one consumer started
// reading the whole basket and producing one answer per field. It was
// never an argument against a claim having a name — collector still
// produces exactly this shape, transcribed and synthesised claims alike,
// and composer still has to normalize/validate/ground it before writing.
import type { FieldProvenance } from "./provenance.js";

export interface FieldClaim {
  field: string;
  value: string | string[];
  provenance: FieldProvenance;
}
