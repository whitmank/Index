// Authored by Karter Whitman using Claude Opus 5
// Candidate values → the ones fit to write.
//
// Three gates, in an order that is not interchangeable:
//
//   normalise → validate → ground
//
// Normalising first means validation judges the value that would actually
// be written rather than the one that arrived, so an ISBN is checksummed
// in canonical form and a date is checked as a date. Grounding runs last
// because it is the only gate a *transcribed* value skips: a fact copied
// out of an epub's package document is grounded by construction — it came
// from the evidence — while a model's value has to prove it did.
//
// This is where the module's quality bar lives. The spec's own metric is
// that the rate of unsupported populated values matters more than the
// fill rate, and the corpus showed why in the most concrete way
// available: asked about real books, the model produced
// `isbn: "10.1234/9781"` and `isbn: "10.1234/9780128154321"`, DOI-shaped
// strings that appear in no evidence anywhere. Both are caught here —
// once by the checksum, and again by grounding.
import type { AttributeKind, Schema } from "@index/database/types";
import type { FieldClaim } from "../../contracts/field-claim.js";
import type { ResolvedValue } from "../../contracts/resolved-value.js";
import type { ModelingWarning } from "../../contracts/warnings.js";
import { hintFor } from "../../contracts/field-hints.js";
import { coerceToKind, normalizeValue } from "../normalization/normalize-value.js";
import { validateValue } from "./domain-validators.js";
import { excerptFor, groundValue } from "./validate-provenance.js";

export interface Resolution {
  values: ResolvedValue[];
  warnings: ModelingWarning[];
  rejected: number;
}

export interface ResolveRequest {
  candidates: FieldClaim[];
  schema: Schema;
  /** The basket's values, joined — what a model-derived value has to be
   * found in. Never the basket's *keys*: a key like `pdf.Info.Author`
   * contains the word "Author", and grounding against a label rather than
   * content would verify an invention. */
  evidence: string;
}

function flatten(value: string | string[]): string {
  return (Array.isArray(value) ? value.join(" ") : value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Drop a synthesised value that is just another field said twice.
 *
 * The failure this exists for is the model's version of running out of
 * ideas. Asked for a `subject` a book does not state, it does not answer
 * null — it answers with the most prominent string in front of it, which
 * is the title. Over 25 real books that filled `subject` with the title
 * ten times over, and put `publisher: Camille Paglia` on a book whose
 * author is Camille Paglia.
 *
 * Grounding cannot catch any of it: the title genuinely *is* in the
 * evidence. What makes it wrong is not where it came from but where it
 * landed, so the check has to be about the shape of the answer as a
 * whole — a field whose value is another field's is not evidence about
 * that field.
 *
 * Only *synthesised* values are dropped, and only against a field the
 * schema declares earlier. Schema order is meaningful — `attributes[0]`
 * is the item's name and users order by what matters — so the duplicate is
 * removed from the less important place. A transcribed fact is never
 * dropped: if a package document states a publisher that happens to
 * equal the author, that is a self-published book saying so.
 */
function dropEchoes(values: ResolvedValue[], schema: Schema): [ResolvedValue[], string[]] {
  const order = new Map((schema.attributes ?? []).map((attribute, at) => [attribute.attribute.toLowerCase(), at]));
  const rank = (field: string) => order.get(field.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;

  const dropped: string[] = [];
  const kept = values.filter((value) => {
    if (value.provenance.origin !== "language-model") return true;
    const mine = flatten(value.value);
    const echo = values.some((other) => {
      if (other === value || rank(other.field) >= rank(value.field)) return false;
      const theirs = flatten(other.value);
      if (mine === theirs) return true;
      // Containment too, not just equality — the same failure arrives as
      // a *fragment* just as often. A book titled `Designing
      // Data-Intensive Applications` came back with the subject
      // `Data-Intensive Applications`, which is not a topic, it is the
      // title with a word removed. Length-guarded so two genuinely short
      // values are not read as one quoting the other.
      const shorter = mine.length <= theirs.length ? mine : theirs;
      const longer = mine.length <= theirs.length ? theirs : mine;
      return shorter.length >= 12 && longer.includes(shorter);
    });
    if (echo) dropped.push(value.field);
    return !echo;
  });

  return [kept, dropped];
}

function kindOf(schema: Schema, field: string): AttributeKind {
  return (
    (schema.attributes ?? []).find((entry) => entry.attribute.toLowerCase() === field.toLowerCase())?.kind ??
    "string"
  );
}

export function resolveValues(request: ResolveRequest): Resolution {
  const { candidates, schema, evidence } = request;
  const warnings: ModelingWarning[] = [];
  const values: ResolvedValue[] = [];
  let rejected = 0;

  const reject = (candidate: FieldClaim, why: string) => {
    rejected += 1;
    warnings.push({
      code: "value-rejected",
      field: candidate.field,
      ...(candidate.provenance.sourceIds[0] ? { sourceId: candidate.provenance.sourceIds[0] } : {}),
      message: `'${candidate.field}' rejected: ${why}`,
      provenance: candidate.provenance,
    });
  };

  for (const candidate of candidates) {
    const hint = hintFor(candidate.field);

    const normalized = normalizeValue(candidate.value, hint);
    if (normalized === null) {
      reject(candidate, "could not be put in canonical form");
      continue;
    }

    const verdict = validateValue(normalized, hint);
    if (!verdict.ok) {
      reject(candidate, verdict.reason ?? "failed validation");
      continue;
    }

    // A transcribed fact is grounded by construction; only synthesis has
    // to prove itself. Checking a value the evidence literally supplied
    // would be theatre, and would occasionally fail on its own source
    // when normalisation rewrote it.
    let provenance = candidate.provenance;
    if (provenance.origin === "language-model") {
      const flat = Array.isArray(normalized) ? normalized.join(" ") : normalized;
      const grounding = groundValue(flat, evidence);
      if (!grounding.grounded) {
        reject(
          candidate,
          `not supported by the evidence (${grounding.missing.slice(0, 4).join(", ")} appear nowhere in it)`,
        );
        continue;
      }
      // The recorded confidence is the *measured* grounding support, not
      // the model's opinion of itself.
      provenance = {
        ...provenance,
        confidence: Number(grounding.support.toFixed(2)),
        ...(excerptFor(flat, evidence) ? { excerpt: excerptFor(flat, evidence) as string } : {}),
      };
    }

    const kind = kindOf(schema, candidate.field);
    values.push({
      field: candidate.field,
      value: coerceToKind(normalized, kind),
      kind,
      provenance,
    });
  }

  const [kept, echoes] = dropEchoes(values, schema);
  for (const field of echoes) {
    rejected += 1;
    warnings.push({
      code: "value-rejected",
      field,
      message: `'${field}' rejected: the answer repeats another field rather than saying anything about ${field}`,
    });
  }

  return { values: kept, warnings, rejected };
}
