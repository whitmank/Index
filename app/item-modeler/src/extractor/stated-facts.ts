// Authored by Karter Whitman using Claude Opus 5
// The facts a file states outright, taken at its word.
//
// Not a return of the priority ladder. There is no ranking here, no
// comparison, no arbitration — just a short list of places where a format
// *declares* a field, transcribed. Everything interpretive still belongs
// to the model.
//
// The reason this exists is measured. Copying `dc:title` into `title` is
// a solved problem at 100% reliability; asking a 1.2B model to do it
// introduced failures that did not previously exist — on a book whose OPF
// plainly said `dc:title: Tantra Illuminated`, the model returned null.
// Transcription is where a small model is weakest and deterministic code
// is perfect, so the deterministic half keeps it.
//
// **Why only the OPF, and not a PDF's metadata.** The two are not of the
// same kind. An epub's package document is a *required* metadata
// document, structured by the OCF spec, written to describe the work. A
// PDF's Info dictionary is an optional grab-bag filled in by whatever
// tool produced the file, and its XMP packet is frequently about an
// embedded image rather than the document. The corpus reflects the
// difference exactly: across 25 real books the OPF gave a correct title
// in 13 of 17 epubs, while a PDF's own metadata gave one in 2 of 8 — and
// on those PDFs the model, reading the whole basket, did better than the
// file did. So EPUBs are transcribed and PDFs are synthesised.
//
// **Why `published` is not here.** It is the one field where a file
// routinely lies: an ebook's `dc:date` is often when somebody converted
// it, not when the work was published. Tantra Illuminated declares
// `2015-05-07`; it was published in 2013, which its filename knows.
// Deciding between those two is exactly the cross-referencing the model
// is for.
import type { Schema } from "@index/database/types";
import type { EvidenceBasket } from "./evidence/basket.js";
import type { FieldProvenance } from "../contracts/provenance.js";
import { fieldForConcept, type FieldHint } from "../contracts/field-hints.js";

export interface StatedFact {
  field: string;
  value: string;
  provenance: FieldProvenance;
}

/**
 * Basket key → concept, in order of authority within each concept. The
 * first key present wins, and the ordering is the whole of that rule.
 */
const STATED: [key: string, concept: FieldHint][] = [
  ["opf.dc:title", "title"],
  ["opf.dc:creator", "author"],
  ["opf.dc:publisher", "publisher"],
  // Arithmetic rather than assertion: a checksum settles which of a
  // book's several declared identifiers is the ISBN, and nothing a model
  // infers should override a number that verifies.
  ["verified_isbn13", "isbn"],
];

export function statedFacts(
  basket: EvidenceBasket,
  schema: Schema,
  now: () => Date,
): StatedFact[] {
  const facts: StatedFact[] = [];
  const claimed = new Set<string>();

  for (const [key, concept] of STATED) {
    const field = fieldForConcept(schema, concept);
    if (!field || claimed.has(field.attribute)) continue;

    const entry = basket.entries.find((candidate) => candidate.key === key);
    if (!entry) continue;

    claimed.add(field.attribute);
    facts.push({
      field: field.attribute,
      value: entry.value,
      provenance: {
        origin: "deterministic",
        sourceIds: [entry.sourceId],
        location: key,
        method: key.startsWith("verified") ? "checksum" : "epub-opf",
        excerpt: entry.value,
        confidence: 1,
        at: now().toISOString(),
      },
    });
  }

  return facts;
}
