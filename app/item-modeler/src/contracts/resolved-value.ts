// Authored by Karter Whitman using Claude Opus 5
// One field, settled — the only thing the application layer is handed.
//
// This replaced a `FieldClaim` and the machinery around it. A claim was a
// *candidate*, and candidates existed because several readers each
// interpreted their own source in isolation and something downstream had
// to arbitrate between them: a priority ladder, an agreement test, a
// merge rule, a conflict detector. That whole layer is gone. One
// consumer now reads the whole basket at once and produces one answer per
// field, so there is nothing left to arbitrate.
//
// What remains of the old design is the part that was never about
// arbitration: a value must still say where it came from, and must still
// be checked before it is written.
import type { AttributeKind } from "@index/database/types";
import type { FieldProvenance } from "./provenance.js";

export interface ResolvedValue {
  /** The schema field, in the schema's own words. */
  field: string;
  value: string | string[];
  kind: AttributeKind;
  provenance: FieldProvenance;
}

/**
 * The item's name is the field the schema put first —
 * `Schema.attributes[0]`, the way `resources[0]` is the primary
 * resource, and reordering is the same gesture in both places.
 *
 * Positional rather than flagged because the word is no guide: a `person`
 * type's `title` means Dr. or a job, not a name. What decides is where
 * the user put it.
 */
export function isNamingField(field: string, schema: { attributes: { attribute: string }[] }): boolean {
  return schema.attributes[0]?.attribute === field;
}
