// Authored by Karter Whitman using Claude Opus 5
// What a resource can say about itself once its type is known, and the
// one place that decides what those sayings are called.
//
// Extractors return *observations*, not fields: a key in whatever
// vocabulary the format itself uses (an epub's OPF says "creator"; the
// v1 book extractor calls it "author"), which is a different thing from
// the field name a user's schema happens to declare. `toFields` is the
// join between the two, and the only thing that has to change when the
// matching gets smarter — no extractor knows a schema exists.
//
// Before the join, a `book` schema declaring `writer` got an empty
// `writer` row from the layout and an orphan `author` row underneath it:
// two rows for one fact, one of them blank, in the panel opened to see
// what was extracted.
import type { Field, FieldKind, Schema, SchemaField } from "@index/database/types";
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
 * Other names for the ingestor's own vocabulary — a claim about what
 * *this* module's `author` could reasonably be called, not a guess at
 * what any particular schema means by a word. Kept short and obvious on
 * purpose: a synonym that fires wrongly puts a value in the wrong field
 * silently, which is worse than leaving it unmatched where it is at
 * least visible as its own row.
 *
 * Notably absent: `title → name` and `isbn → identifier`. Both are too
 * generic to claim — an item already has a name of its own, and plenty
 * of things carry an identifier that is not an ISBN.
 */
const SYNONYMS: Record<string, string[]> = {
  author: ["writer", "creator", "by", "authors"],
  published: ["published date", "publication date", "release date", "year", "date"],
  genre: ["genres", "subject", "subjects", "category", "categories"],
  isbn: ["isbn13", "isbn10"],
};

/** Case, spaces, underscores and hyphens all stop mattering: `Release
 * Date`, `release_date` and `releaseDate` are one name. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function namesFor(key: string): string[] {
  return [key, ...(SYNONYMS[key.trim().toLowerCase()] ?? [])].map(normalize);
}

/**
 * Tried in order, and the order is the point: a schema field named
 * exactly what the observation is called wins over one whose *label*
 * happens to, and both win over a synonym. Without the ordering, a
 * schema declaring both `author` and `writer` could hand the author to
 * whichever came first in the list.
 */
const RULES: ((observation: Observation, field: SchemaField) => boolean)[] = [
  (observation, field) => normalize(field.name) === normalize(observation.key),
  (observation, field) =>
    Boolean(field.label) && normalize(field.label ?? "") === normalize(observation.key),
  (observation, field) => namesFor(observation.key).includes(normalize(field.name)),
  (observation, field) =>
    Boolean(field.label) && namesFor(observation.key).includes(normalize(field.label ?? "")),
];

/**
 * Reshape a value for the kind its field actually declares. Mirrors the
 * renderer's `coerceFieldValue` (frontend/src/lib/fields.ts), which the
 * dependency rule keeps out of reach from here — the same trade the
 * derivation ladder already makes, and for the same reason.
 */
function coerce(value: Field["value"], kind: FieldKind): Field["value"] {
  if (kind === "list") {
    if (Array.isArray(value)) return value;
    return value.trim() === "" ? [] : [value];
  }
  return Array.isArray(value) ? value.join(", ") : value;
}

function asField(observation: Observation): Field {
  return { name: observation.key, value: observation.value, kind: observation.kind };
}

/**
 * Observations → the rows written onto an item, against the schema for
 * the type they were extracted for.
 *
 * Three decisions worth stating, because none of them are forced:
 *
 * - **The schema's kind wins.** A schema is the declaration of what a
 *   type carries; an observation only knows what the file said. So the
 *   field takes the declared kind and the value is reshaped to fit.
 * - **Unmatched observations are kept**, as rows of their own, rather
 *   than dropped. The file really did say them, and a visible row the
 *   user can delete beats data that silently never arrived.
 * - **Unmatched schema fields are not emitted.** The layout already
 *   draws a type's declared fields from the schema itself
 *   (layouts/registry.tsx), so writing empty rows here would put the
 *   same blanks on the item twice.
 *
 * With no schema — an untyped item, or a type nobody has defined fields
 * for — every key passes through verbatim, which is what shipped before
 * this join existed.
 */
export function toFields(observations: Observation[], schema?: Schema): Field[] {
  const fields = schema?.fields ?? [];
  if (fields.length === 0) return observations.map(asField);

  const pairs = new Map<SchemaField, Observation>();
  const claimed = new Set<Observation>();

  for (const rule of RULES) {
    for (const field of fields) {
      if (pairs.has(field)) continue;
      const match = observations.find(
        (observation) => !claimed.has(observation) && rule(observation, field),
      );
      if (!match) continue;
      pairs.set(field, match);
      claimed.add(match);
    }
  }

  // Matched rows in the order the type declares them, so an item reads
  // the way its schema does; whatever the file said that the schema has
  // no word for follows, in the order it was read.
  const matched = fields
    .filter((field) => pairs.has(field))
    .map((field) => {
      const observation = pairs.get(field) as Observation;
      return { name: field.name, value: coerce(observation.value, field.kind), kind: field.kind };
    });

  return [...matched, ...observations.filter((o) => !claimed.has(o)).map(asField)];
}

/**
 * Best-effort, like every derivation: no type, no extractor for it, or
 * no probe to read means no fields — never an error. An item whose
 * metadata is unreadable still gets created and still gets classified,
 * just with nothing pre-filled.
 */
export async function extract(
  type: string | null,
  probe: Probe | null,
  schema?: Schema,
): Promise<Field[]> {
  const extractor = type ? EXTRACTORS[type] : undefined;
  if (!extractor || !probe) return [];
  try {
    return toFields(await extractor(probe), schema);
  } catch {
    return [];
  }
}
