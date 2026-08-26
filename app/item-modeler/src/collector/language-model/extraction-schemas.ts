// Authored by Karter Whitman using Claude Opus 5
// The item's own type, as a JSON schema the model is constrained to.
//
// Generated from the user's `Schema` rather than hardcoded, so a type
// somebody invented — `monograph`, `zine`, `recipe` — is extracted for
// exactly as well as `book`. The model's output is keyed by the schema's
// own field names, which is what removes the need for any vocabulary
// mapping between the two: there is nothing to translate when the answer
// already arrives in the right words.
//
// **Every field is nullable and every field is required.** That pairing
// is deliberate. Required means the model must consider each field rather
// than quietly omitting the hard ones; nullable means "I did not find
// this" is expressible, which is the difference between an honest blank
// and an invention. With a grammar enforcing it at the token level, the
// model cannot emit a field that is neither.
import type { AttributeKind, Schema, SchemaAttribute } from "@index/database/types";
import { hintFor } from "../../contracts/field-hints.js";

export interface JsonSchema {
  type: "object";
  properties: Record<string, { oneOf: [{ type: "string" }, { type: "null" }]; description?: string }>;
  required: string[];
  additionalProperties: false;
}

/**
 * What each concept means, said in the schema rather than the prompt.
 *
 * Field descriptions travel with the property they describe, which for a
 * small model is worth more than the same words in a paragraph of
 * instructions — measured on a real library, moving guidance out of the
 * system prompt and into the schema was the difference between reading a
 * title apart and returning the whole filename.
 */
const GUIDANCE: Record<string, string> = {
  title:
    "The work's full title, including any subtitle. Never the author, publisher, year, edition, file extension, or archive name.",
  author: "Who wrote the work. Comma-separated if there are several.",
  published:
    "The year the work was published, as YYYY. Not a file creation date and not an ebook conversion date.",
  // The two below carry an explicit "or null" because they are the two
  // the model reached for something rather than declining. Measured over
  // a real library it answered `subject` with the title ten times and
  // `publisher` with the software that produced the PDF twice, so the
  // instruction that matters most for these is permission to say nothing.
  publisher:
    "The publishing house that issued the work, e.g. Penguin or Oxford University Press. Never the author, and never the software that produced the file. Null if no publisher is named.",
  isbn: "The work's ISBN, digits only. Never a DOI, hash, or other identifier.",
  subject:
    "What the work is about: its topic, genre or subject headings. Never the title repeated, and never a file format. Null if the evidence does not state a subject.",
  pages: "How many pages the work has, as a number.",
};

/** A hint for the shape the value should take, so a `date` field is not
 * answered with a sentence. */
function kindHint(kind: AttributeKind): string {
  if (kind === "date") return " Give a year (YYYY) or an ISO date.";
  if (kind === "number") return " Give digits only.";
  if (kind === "list") return " Comma-separated if there are several.";
  return "";
}

function describe(attribute: SchemaAttribute): string {
  const guidance = GUIDANCE[hintFor(attribute.attribute)];
  if (guidance) return guidance;
  return `The work's ${attribute.attribute}.${kindHint(attribute.kind)}`;
}

/**
 * A schema covering only the fields still wanted.
 *
 * `already` names the fields the deterministic half settled, and they are
 * left out entirely rather than sent for confirmation. Two reasons: a
 * shorter schema is answered better by a small model, and a field that is
 * not in the grammar cannot be overwritten by a worse answer.
 */
export function schemaForExtraction(schema: Schema, already: string[] = []): JsonSchema | null {
  const settled = new Set(already.map((name) => name.toLowerCase()));
  const wanted = (schema.attributes ?? []).filter((attribute) => !settled.has(attribute.attribute.toLowerCase()));
  if (wanted.length === 0) return null;

  return {
    type: "object",
    properties: Object.fromEntries(
      wanted.map((attribute) => [
        attribute.attribute,
        {
          oneOf: [{ type: "string" }, { type: "null" }] as [{ type: "string" }, { type: "null" }],
          description: describe(attribute),
        },
      ]),
    ),
    required: wanted.map((attribute) => attribute.attribute),
    additionalProperties: false,
  };
}
