// Authored by Karter Whitman using Claude Opus 5
// What a resource can say about itself once its type is known, and the
// one place that decides what those sayings are called.
//
// Extractors return *observations*, not fields: a key in whatever
// vocabulary the format itself uses (an epub's OPF says "creator"; the
// v1 book extractor calls it "author"), which is a different thing from
// the field name a user's schema happens to declare. Today `toFields`
// maps one onto the other by passing the key straight through, which is
// exactly what the ingestor did before this split. The next pass gives
// that function the item's schema and lets it do a real join — a
// matching ladder, kind coercion via lib/fields.ts's `coerceFieldValue`,
// and a decision about observations that match nothing. Extractors do
// not change when it does, which is the reason for the seam.
import type { Field, FieldKind } from "@index/database/types";
import { extractBook } from "./formats/book.js";
import type { Probe } from "./probe.js";

/** One thing a file declared about itself, in the format's own words. */
export interface Observation {
  key: string;
  value: Field["value"];
  kind: FieldKind;
}

export type Extractor = (probe: Probe) => Promise<Observation[]>;

/** Type-specific extractors, parallel to the renderer's layout registry:
 * additive — a new type's extractor is a new entry, not a change to any
 * control flow. */
const EXTRACTORS: Record<string, Extractor> = {
  book: extractBook,
};

/**
 * Observations → the rows written onto an item. The identity map, for
 * now: an observation's key becomes a field's name verbatim, which is
 * what shipped before extractors and observations were separate things.
 */
export function toFields(observations: Observation[]): Field[] {
  return observations.map(({ key, value, kind }) => ({ name: key, value, kind }));
}

/**
 * Best-effort, like every derivation: no type, no extractor for it, or
 * no probe to read means no fields — never an error. An item whose
 * metadata is unreadable still gets created and still gets classified,
 * just with nothing pre-filled.
 */
export async function extract(type: string | null, probe: Probe | null): Promise<Field[]> {
  const extractor = type ? EXTRACTORS[type] : undefined;
  if (!extractor || !probe) return [];
  try {
    return toFields(await extractor(probe));
  } catch {
    return [];
  }
}
