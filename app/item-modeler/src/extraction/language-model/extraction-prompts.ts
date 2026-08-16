// Authored by Karter Whitman using Claude Opus 5
// What the model is told, and the version it is told under.
//
// The format is Liquid's, not an invention: **the schema goes in the
// system prompt and the evidence goes in the user turn.** That detail is
// worth stating because getting it backwards is silent — a grammar still
// constrains the output, so the answers stay well-formed JSON while the
// model has never actually seen the schema it is filling. Measured on a
// real library, correcting it turned a run that invented an ISBN, a date
// and a publisher for a camera-roll scan into one that returned five
// clean nulls.
//
// The prompt is kept short for the same reason. This is a 1.2B model
// tuned for extraction, and it degrades under long instruction lists: an
// earlier version with six prose rules parsed *worse* than one with none.
// What guidance there is travels in the schema's field descriptions,
// beside the property it describes (extraction-schemas.ts).
import type { JsonSchema } from "./extraction-schemas.js";

/** Bumped whenever the wording changes, and recorded in provenance — a
 * value's meaning depends on what the model was asked, so an audit trail
 * that does not name the prompt cannot explain its own contents. */
export const PROMPT_VERSION = "1.0.0";

/**
 * The system turn: the schema, then the few things the schema cannot say.
 *
 * Three rules, and each earns its line. The key convention is what lets
 * the model weigh a file's own claim against a person's; the null rule is
 * the entire defence against invention; the outside-knowledge rule is
 * what keeps a famous title from being "remembered" rather than read.
 */
export function systemPrompt(schema: JsonSchema): string {
  return `Return data as a JSON object with the following schema:
${JSON.stringify(schema, null, 2)}

The input is evidence gathered about a file. A key beginning "opf." or "pdf." is what the file states about itself. "filename:" is what a person or an archive named it, and often packs several facts together with separators. A key beginning "verified_" has already been checked and is reliable.

Use only the evidence. Never use outside knowledge to fill a field.
If the evidence does not establish a field, return null for it. A missing field is correct; a guess is not.`;
}

/** The user turn: the basket, fenced so its `key: value` lines are not
 * read as further instructions. */
export function userPrompt(basket: string): string {
  return `<evidence>\n${basket}\n</evidence>`;
}
