// Authored by Karter Whitman using Claude Opus 5
// Are these two claims about the same thing, the same claim?
//
// This is the question that decides whether the user sees a conflict, so
// getting it wrong is expensive in both directions. Too strict and every
// item collects conflicts between two spellings of one fact — `Herbert,
// Frank` against `Frank Herbert`, an isbn-10 against the same book's
// isbn-13 — which trains the user to ignore conflicts entirely. Too loose
// and two genuinely different authors quietly become one.
//
// The rule that keeps it honest: comparison is *field-aware*, and every
// looseness here is a named equivalence with a reason, never a fuzzy
// string distance. Two values are the same when there is a rule saying
// what makes them the same.
import { datesAgree } from "./normalize-dates.js";
import { normalizeIsbn } from "./normalize-identifiers.js";
import { sameName } from "./normalize-names.js";
import type { FieldHint } from "./field-hints.js";

function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function flatten(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * A title match ignores punctuation, case and a leading article, because
 * those differ between a file's metadata and its name as a matter of
 * routine — `The Buddha in the Machine` and `Buddha in the Machine:
 * Art, Technology…` are one book recorded twice.
 *
 * Containment counts, and only in one direction: a subtitle is extra
 * information about the same work, so the longer title is the better
 * record of it rather than a competing claim.
 */
function titlesAgree(a: string, b: string): boolean {
  const left = flatten(a).replace(/^(the|a|an) /, "");
  const right = flatten(b).replace(/^(the|a|an) /, "");
  if (left === right) return true;
  if (left.length < 8 || right.length < 8) return false;
  return left.startsWith(right) || right.startsWith(left);
}

/** Do two values state the same fact? */
export function valuesAgree(a: string | string[], b: string | string[], hint: FieldHint): boolean {
  const left = asList(a);
  const right = asList(b);

  switch (hint) {
    case "author": {
      // Order does not matter and neither does one source listing more
      // co-authors than another: a subset is an incomplete record of the
      // same authorship, not a contradiction of it.
      const small = left.length <= right.length ? left : right;
      const large = left.length <= right.length ? right : left;
      return (
        small.length > 0 &&
        small.every((name) => large.some((candidate) => sameName(name, candidate)))
      );
    }
    case "isbn": {
      const first = normalizeIsbn(left[0] ?? "");
      const second = normalizeIsbn(right[0] ?? "");
      return first !== null && first === second;
    }
    case "published":
      return datesAgree(left[0] ?? "", right[0] ?? "");
    case "title":
      return titlesAgree(left[0] ?? "", right[0] ?? "");
    case "pages":
    case "generic":
    default: {
      if (left.length !== right.length) {
        // A list against a scalar: compare as sets, since a `list` field
        // fed by a `string` source is a shape difference, not a
        // disagreement.
        const leftSet = new Set(left.map(flatten));
        const rightSet = new Set(right.map(flatten));
        if (leftSet.size !== rightSet.size) return false;
        return [...leftSet].every((entry) => rightSet.has(entry));
      }
      return left.every((entry, at) => flatten(entry) === flatten(right[at] ?? ""));
    }
  }
}

/**
 * Of two values that agree, which is the better record?
 *
 * Only ever called on values already known to state the same fact, so
 * this is choosing a spelling and cannot change what the item says. More
 * precision wins: the fuller date, the longer title with its subtitle,
 * the list naming every author rather than the first.
 */
export function richer(a: string | string[], b: string | string[]): string | string[] {
  const size = (value: string | string[]) =>
    Array.isArray(value) ? value.join("").length + value.length : value.length;
  return size(b) > size(a) ? b : a;
}
