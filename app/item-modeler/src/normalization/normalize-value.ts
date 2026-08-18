// Authored by Karter Whitman using Claude Opus 5
// The general clean-up every value gets, and the shape its field declares.
//
// Two jobs that look alike and are not. *Normalising* is making one fact
// have one spelling — trimming, collapsing whitespace, de-duplicating a
// list. *Coercing* is making a value fit the kind its schema declares,
// which is a change of type rather than of spelling.
//
// They are kept in one file because every claim needs both and in that
// order, and split into two functions because only the first is safe to
// use when comparing two claims for equality.
import type { AttributeKind } from "@index/database/types";
import { collapseWhitespace, splitPeople } from "./normalize-names.js";
import { normalizeDate } from "./normalize-dates.js";
import { normalizeIsbn } from "./normalize-identifiers.js";
import type { FieldHint } from "./field-hints.js";

export type { FieldHint };

/** Zero-width and directional marks, which arrive from PDF text
 * extraction and from copy-pasted metadata, and which make two identical
 * strings compare unequal for no visible reason. */
const INVISIBLE = /[​-‍﻿‪-‮]/g;

/** Typographic quotes and dashes, folded to their ASCII equivalents so
 * `Don't` and `Don’t` are one title. */
function foldPunctuation(value: string): string {
  return value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
}

export function cleanText(value: string): string {
  return collapseWhitespace(value.replace(INVISIBLE, ""));
}

/** De-duplicated, order preserved, compared case-insensitively — a list
 * that says "Science Fiction" and "science fiction" is one subject
 * written twice. */
export function dedupeList(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    const key = cleaned.toLowerCase();
    if (cleaned === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(cleaned);
  }
  return kept;
}

/**
 * Field-aware normalisation: what a value should look like once the
 * module has finished with it.
 *
 * `hint` is the module's own idea of what the field *means*, not the
 * schema's name for it — `hintFor` (field-hints.ts) resolves a schema's
 * `writer` to the hint `author` before this is called, so a user's
 * vocabulary never has to be repeated here.
 *
 * Returns null when the value cannot be put in canonical form at all,
 * which is a rejection: an isbn whose check digit fails and a date that
 * does not parse are not values to be written in whatever form they
 * arrived.
 */
export function normalizeValue(
  value: string | string[],
  hint: FieldHint,
): string | string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeValue(entry, hint))
      .filter((entry): entry is string => typeof entry === "string");
    const list = dedupeList(normalized);
    return list.length > 0 ? list : null;
  }

  const text = cleanText(foldPunctuation(value));
  if (text === "") return null;

  switch (hint) {
    case "author": {
      const people = splitPeople(text);
      if (people.length === 0) return null;
      return people.length === 1 ? (people[0] as string) : people;
    }
    case "isbn":
      return normalizeIsbn(text);
    case "published":
      return normalizeDate(text);
    case "pages": {
      const digits = /^\d+$/.exec(text.replace(/[\s,]/g, ""));
      if (!digits) return null;
      const count = Number(digits[0]);
      // A page count of zero is an empty field written as a number, and
      // one in the millions is a parse that went wrong.
      return count > 0 && count < 200_000 ? String(count) : null;
    }
    case "title":
      // Titles keep their punctuation and their case; only the invisible
      // characters and the whitespace are touched. A title is the one
      // field where "tidying" is mostly damage.
      return text;
    case "generic":
    default:
      return text;
  }
}

/**
 * Reshape a normalised value for the kind its field actually declares.
 *
 * The schema's kind wins over the source's: a schema is the declaration
 * of what a type carries, where a reader only knows what one file said.
 * So a reader that found two subjects hands a `list` to a `string` field
 * as `a, b` rather than the field quietly becoming a list.
 */
export function coerceToKind(value: string | string[], kind: AttributeKind): string | string[] {
  if (kind === "list") {
    if (Array.isArray(value)) return value;
    return value.trim() === "" ? [] : [value];
  }
  return Array.isArray(value) ? value.join(", ") : value;
}

/** A field carrying nothing — what "empty" means when the ownership
 * policy asks whether there is a value to protect. */
export function isBlank(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value)
    ? value.every((entry) => entry.trim() === "")
    : value.trim() === "";
}
