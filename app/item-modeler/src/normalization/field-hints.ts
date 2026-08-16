// Authored by Karter Whitman using Claude Opus 5
// What a field *means*, independent of what a schema calls it.
//
// Normalisation and validation need to know that a field is a date before
// they can canonicalise it, and that it is an identifier before they can
// checksum it. The user's schema only supplies a word.
//
// This is all that survives of a much larger synonym table. That table
// existed to translate every source's vocabulary into every schema's —
// `creator`, `writer`, `by`, `authors` — and it was permanently
// incomplete by construction, because it was a hand-written version of a
// job a language model does natively. The model now maps vocabularies;
// what remains here is only the handful of *concepts* the deterministic
// half has type-specific rules for.
import type { Schema, SchemaField } from "@index/database/types";

/** The concepts this module can normalise or validate differently. */
export type FieldHint =
  | "title"
  | "author"
  | "published"
  | "publisher"
  | "isbn"
  | "subject"
  | "pages"
  | "generic";

/** Names that identify a concept. Short by design — this decides which
 * *rules* apply, not which field a value lands in. */
const CONCEPTS: Record<Exclude<FieldHint, "generic">, string[]> = {
  title: ["title", "name"],
  author: ["author", "authors", "writer", "creator", "by"],
  published: ["published", "publication date", "publishdate", "date", "year", "released"],
  publisher: ["publisher", "imprint", "press"],
  isbn: ["isbn", "isbn13", "isbn10"],
  subject: ["subject", "subjects", "genre", "genres", "topic", "topics", "category", "categories"],
  pages: ["pages", "page count", "length", "extent"],
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function hintFor(field: string): FieldHint {
  const wanted = normalize(field);
  for (const [concept, names] of Object.entries(CONCEPTS)) {
    if (names.some((name) => normalize(name) === wanted)) return concept as FieldHint;
  }
  return "generic";
}

/**
 * The schema field a concept belongs to, or null when the type does not
 * carry one.
 *
 * Used only by the deterministic pre-fill, which needs to know where to
 * put a fact the file stated outright. The model does not need this — its
 * output is keyed by the schema's own field names, because the JSON
 * schema it fills is generated from them.
 */
export function fieldForConcept(schema: Schema, concept: FieldHint): SchemaField | null {
  const names = concept === "generic" ? [] : CONCEPTS[concept];
  for (const field of schema.fields ?? []) {
    const candidates = [field.name, field.label ?? ""].map(normalize);
    if (names.some((name) => candidates.includes(normalize(name)))) return field;
  }
  return null;
}

/** `fields[0]` is the item's name, the way `resources[0]` is the primary
 * resource — ordered, and reordering is how the user says which it is. */
export function namingField(schema: Schema): SchemaField | undefined {
  return schema.fields?.[0];
}
