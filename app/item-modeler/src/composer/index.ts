// Authored by Karter Whitman using Claude Sonnet 5
// The composer: candidate field claims in, a written schema and an
// audited change set out.
//
// Normalise, validate, and ground (validation/resolve-values.ts) — the
// one gate a transcribed claim skips is grounding, since it came from the
// evidence by construction and only a synthesised one has to prove it
// did — then apply what survives under the ownership policy
// (application/apply-modeling-result.ts): a user's value is never
// overwritten, only confirmed or conflicted.
//
// Nothing here reads a resource or reaches for a model; that already
// happened before a claim reached this module. Composer only ever asks
// "should this be written, and under what name in the change set."
import type { Item, Schema } from "@index/database/types";
import type { FieldClaim } from "../contracts/field-claim.js";
import type { ConflictPolicy } from "../contracts/modeling-options.js";
import type { FieldChange } from "../contracts/changes.js";
import type { ModelingConflict } from "../contracts/conflicts.js";
import type { ModelingWarning } from "../contracts/warnings.js";
import { resolveValues } from "./validation/resolve-values.js";
import { applyModelingResult } from "./application/apply-modeling-result.js";

export interface ComposeRequest {
  claims: FieldClaim[];
  /** What a synthesised claim must be found in to count as grounded —
   * collector's basket, joined (collector/index.js's `evidenceText`). */
  evidenceText: string;
  schema: Schema;
  /** Ownership, naming (`mayRename`), and conflict detection all read off
   * this — a synthetic empty Item (fresh at intake, nothing to own yet)
   * is exactly as valid a caller as a real one. */
  existing: Item;
  overwriteModeledValues: boolean;
  conflictPolicy: ConflictPolicy;
  userFields: string[];
  derivedName: string | null;
  includeProvenance: boolean;
}

export interface ComposeResult {
  item: Item;
  changes: FieldChange[];
  conflicts: ModelingConflict[];
  warnings: ModelingWarning[];
  rejected: number;
  resolvedCount: number;
  languageModelCount: number;
}

export async function composeSchema(request: ComposeRequest): Promise<ComposeResult> {
  const resolution = resolveValues({
    candidates: request.claims,
    schema: request.schema,
    evidence: request.evidenceText,
  });
  const warnings: ModelingWarning[] = [...resolution.warnings];

  // A field nothing spoke to is not an error — evidence was absent, which
  // the spec says to prefer over invention.
  for (const attribute of request.schema.attributes ?? []) {
    if (resolution.values.some((value) => value.field === attribute.attribute)) continue;
    warnings.push({
      code: "field-unsupported",
      field: attribute.attribute,
      message: `nothing in the evidence established '${attribute.attribute}'`,
    });
  }

  const applied = applyModelingResult({
    item: request.existing,
    schema: request.schema,
    resolved: resolution.values,
    userFields: request.userFields,
    derivedName: request.derivedName,
    overwriteModeledValues: request.overwriteModeledValues,
    conflictPolicy: request.conflictPolicy,
  });

  const languageModelCount = resolution.values.filter(
    (value) => value.provenance.origin === "language-model",
  ).length;

  return {
    item: applied.item,
    changes: request.includeProvenance
      ? applied.changes
      : applied.changes.map(({ provenance: _provenance, ...rest }) => rest),
    conflicts: applied.conflicts,
    warnings,
    rejected: resolution.rejected,
    resolvedCount: resolution.values.length,
    languageModelCount,
  };
}
