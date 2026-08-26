// Authored by Karter Whitman using Claude Opus 5
// Grounding: is this value actually in the evidence it claims to come from?
//
// The single most important check in the module, and the reason a
// language model can be trusted with synthesis at all. The spec puts it
// plainly — an unsupported model-generated value is invalid even when it
// is syntactically plausible — and the corpus showed exactly why: asked
// about books, the model produced `isbn: "10.1234/9781"` and
// `isbn: "10.1234/9780128154321"`, DOI-shaped strings appearing nowhere
// in any evidence. Both read as perfectly ordinary identifiers. Neither
// existed.
//
// **Why not a substring test.** The right answer is frequently not
// verbatim: an OPF says `Herbert, Frank` and the correct value is
// `Frank Herbert`; a filename says `Free Women, Free Men_ Sex, Gender,
// Feminism-Pantheon` and the correct title stops before the publisher.
// Rearranging and trimming is the work being asked for, so a check
// demanding literal containment would reject the good answers along with
// the invented ones.
//
// So the test is **token-level**: every significant token of a claimed
// value must appear somewhere in the basket. Rearrangement passes,
// trimming passes, and invention fails — because an invented value
// carries tokens that are nowhere in the evidence.
import { EXCERPT_MAX } from "../../collector/evidence/content-limits.js";

/** Tokens too common to be evidence of anything. A value made entirely
 * of these is not grounded by them. */
const NOISE = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "for", "to", "with", "from",
  "by", "at", "as", "is", "it", "its", "de", "la", "le", "el",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    // Unicode-aware: an accented author's name must tokenise as a name
    // rather than shattering into fragments, or every non-English book
    // fails grounding.
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== "");
}

export interface Grounding {
  grounded: boolean;
  /** 0–1: the share of significant tokens found in the evidence. Recorded
   * as the value's confidence, so a value that only just cleared the bar
   * is visible as such downstream. */
  support: number;
  missing: string[];
}

/**
 * How much of a value must be found before it counts.
 *
 * Not 1.0, and the slack is deliberate. A model correctly expanding
 * `Wallis, Christopher D` to `Christopher Wallis` may add nothing, but
 * one correctly rendering a publisher as `Yale University Press` where
 * the evidence said `Yale Univ. Press` adds a token that is genuinely
 * absent. Below this share, though, the value is mostly words nobody
 * wrote down.
 */
const REQUIRED_SUPPORT = 0.8;

/** Digits are held to the whole: an identifier that is *nearly* in the
 * evidence is a different identifier, and a single wrong digit is exactly
 * how a plausible ISBN gets invented. */
function isNumeric(token: string): boolean {
  return /^\d+$/.test(token);
}

export function groundValue(value: string, evidence: string): Grounding {
  const haystack = new Set(tokens(evidence));
  const wanted = tokens(value);

  const significant = wanted.filter((token) => !NOISE.has(token) && token.length > 1);
  // A value of nothing but noise words and single letters cannot be
  // grounded, and cannot be worth writing either.
  if (significant.length === 0) return { grounded: false, support: 0, missing: wanted };

  const missing = significant.filter((token) => !haystack.has(token));
  const support = (significant.length - missing.length) / significant.length;

  // Any unfound numeric token disqualifies outright, whatever the overall
  // share works out to.
  const numericMissing = missing.some(isNumeric);

  return {
    grounded: !numericMissing && support >= REQUIRED_SUPPORT,
    support,
    missing,
  };
}

/** A short, safe citation of where a value was found. */
export function excerptFor(value: string, evidence: string): string | undefined {
  const first = tokens(value).find((token) => !NOISE.has(token) && token.length > 2);
  if (!first) return undefined;
  const at = evidence.toLowerCase().indexOf(first);
  if (at === -1) return undefined;
  const from = Math.max(0, at - 40);
  return evidence.slice(from, from + EXCERPT_MAX).replace(/\s+/g, " ").trim();
}
