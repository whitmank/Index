// Authored by Karter Whitman using Claude Opus 5
// Comparing a modeled Item against the truth, field by field.
//
// The three states are kept apart on purpose, because collapsing them
// hides the only number that matters:
//
//   correct  populated, and matches the truth
//   missed   the truth has a value, the module left the field empty
//   wrong    populated with something that is not the truth
//
// The spec's quality bar is that *a partial Item is acceptable and a
// confidently populated incorrect one is more harmful*. So **wrong** is
// what gates the work. A fill rate can be raised by guessing, which is
// why it is the number that looks best and means least, and why it is
// reported here only next to the wrongness it cost.
//
// Matching is normalisation-aware or it scores correct answers as
// failures: `Herbert, Frank` against `Frank Herbert`, an isbn-10 against
// the same book's isbn-13, `1965` against `1965-08-01`. Both a strict and
// a normalised verdict are recorded, and the gap between them is itself a
// finding about normalization/.
import type { Item, MetadataEntry, Schema } from "@index/database/types";
import { hintFor } from "../../src/normalization/field-hints.js";
import { valuesAgree } from "../../src/normalization/compare-values.js";
import { isBlank } from "../../src/normalization/normalize-value.js";
import type { FieldChange } from "../../src/contracts/index.js";

export type FieldVerdict = "correct" | "missed" | "wrong" | "absent";

export interface FieldScore {
  field: string;
  verdict: FieldVerdict;
  expected?: MetadataEntry["value"];
  got?: MetadataEntry["value"];
  /** True when the values match only after normalisation — the same fact
   * recorded two ways. Counted as correct, and tracked so the cost of
   * normalisation being wrong is visible. */
  normalizedMatch?: boolean;
  origin?: string;
  method?: string;
  provenanceOk?: boolean;
}

export interface EntryScore {
  source: string;
  note?: string;
  fields: FieldScore[];
  /** Populated fields whose provenance was missing or malformed. Every
   * modeled value must be traceable; one that is not is a defect
   * regardless of whether it happens to be right. */
  ungrounded: string[];
  durationMs: number;
  warnings: number;
  conflicts: number;
  /** A second run over the modeled item changed nothing. */
  idempotent: boolean;
  failure?: string;
}

function valueOf(item: Pick<Item, "metadata">, name: string): MetadataEntry["value"] | undefined {
  return (item.metadata ?? []).find(
    (entry) => entry.attribute !== null && entry.attribute.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/** The naming field is not a row — `attributes[0]` is the item's name. */
function expectedFor(
  truth: Pick<Item, "name" | "metadata">,
  schema: Schema,
  field: string,
): MetadataEntry["value"] | undefined {
  if (schema.attributes[0]?.attribute === field) return truth.name;
  return valueOf(truth, field);
}

/**
 * What the module actually produced for a field — where "produced" means
 * *wrote*, not *ended up carrying*.
 *
 * The distinction only bites on the naming field, and it bites hard. An
 * item is minted carrying its resource's filename, so `item.name` is
 * never blank; a run that read nothing and wrote nothing still comes back
 * called `IMG_2024.pdf`. Scoring that against a truth title counts a
 * value the module declined to claim as one it claimed wrongly — which
 * inflates the wrong rate with exactly the restraint the module is
 * supposed to be rewarded for.
 *
 * So an untouched name reads as absent here, and scores `missed`.
 */
function actualFor(
  item: Item,
  schema: Schema,
  field: string,
  changes: FieldChange[],
): MetadataEntry["value"] | undefined {
  if (schema.attributes[0]?.attribute !== field) return valueOf(item, field);

  const written = changes.some(
    (change) =>
      change.target === "name" &&
      (change.action === "populated" ||
        change.action === "normalized" ||
        change.action === "replaced" ||
        change.action === "confirmed"),
  );
  return written ? item.name : undefined;
}

function strictlyEqual(a: MetadataEntry["value"], b: MetadataEntry["value"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ScoreRequest {
  truth: Pick<Item, "name" | "metadata">;
  modeled: Item;
  schema: Schema;
  changes: FieldChange[];
}

export function scoreFields(request: ScoreRequest): FieldScore[] {
  const { truth, modeled, schema, changes } = request;

  return schema.attributes.map((declared) => {
    const field = declared.attribute;
    const expected = expectedFor(truth, schema, field);
    const got = actualFor(modeled, schema, field, changes);
    const change = changes.find((entry) => entry.field === field);

    const provenance = change?.provenance;
    const base: FieldScore = {
      field,
      verdict: "absent",
      ...(provenance?.origin ? { origin: provenance.origin } : {}),
      ...(provenance?.method ? { method: provenance.method } : {}),
    };

    // The truth says nothing about this field, so there is nothing to be
    // right or wrong about. A value the module found here is not counted
    // against it — the corpus simply does not adjudicate it.
    if (isBlank(expected)) {
      return { ...base, verdict: "absent", ...(got !== undefined ? { got } : {}) };
    }

    if (isBlank(got)) {
      return { ...base, verdict: "missed", expected: expected as MetadataEntry["value"] };
    }

    const exact = strictlyEqual(expected as MetadataEntry["value"], got as MetadataEntry["value"]);
    const agrees =
      exact || valuesAgree(expected as MetadataEntry["value"], got as MetadataEntry["value"], hintFor(field));

    return {
      ...base,
      verdict: agrees ? "correct" : "wrong",
      expected: expected as MetadataEntry["value"],
      got: got as MetadataEntry["value"],
      normalizedMatch: agrees && !exact,
    };
  });
}

/** Every populated field must be traceable to evidence. */
export function ungroundedFields(changes: FieldChange[]): string[] {
  return changes
    .filter((change) => change.action === "populated" || change.action === "replaced")
    .filter((change) => {
      const provenance = change.provenance;
      if (!provenance) return true;
      return (
        !provenance.origin ||
        !provenance.method ||
        !Array.isArray(provenance.sourceIds) ||
        provenance.sourceIds.length === 0 ||
        !provenance.at
      );
    })
    .map((change) => change.field);
}

export interface Totals {
  correct: number;
  missed: number;
  wrong: number;
  absent: number;
  normalizedOnly: number;
}

export function tally(scores: FieldScore[]): Totals {
  const totals: Totals = { correct: 0, missed: 0, wrong: 0, absent: 0, normalizedOnly: 0 };
  for (const score of scores) {
    totals[score.verdict] += 1;
    if (score.normalizedMatch) totals.normalizedOnly += 1;
  }
  return totals;
}

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    correct: a.correct + b.correct,
    missed: a.missed + b.missed,
    wrong: a.wrong + b.wrong,
    absent: a.absent + b.absent,
    normalizedOnly: a.normalizedOnly + b.normalizedOnly,
  };
}

/** Of the fields the corpus adjudicates, the share that were right. */
export function accuracy(totals: Totals): number {
  const judged = totals.correct + totals.missed + totals.wrong;
  return judged === 0 ? 1 : totals.correct / judged;
}

/** Of the fields the module populated, the share that were wrong. The
 * gating number. */
export function wrongRate(totals: Totals): number {
  const populated = totals.correct + totals.wrong;
  return populated === 0 ? 0 : totals.wrong / populated;
}
