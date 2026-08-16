// Authored by Karter Whitman using Claude Opus 5
// What a run returns: an updated Item and everything needed to justify it.
//
// The two-branch shape is the spec's §Failure handling made into a type.
// An Item that could not be filled in is a *success* with warnings — the
// sources simply did not say. A run that could not happen is a failure,
// and it returns no Item at all, because the alternative is inventing
// fallback values to keep the shape, which is exactly what the module
// exists to not do.
import type { Item } from "@index/database/types";
import type { FieldChange } from "./changes.js";
import type { ModelingConflict } from "./conflicts.js";
import type { ModelingWarning } from "./warnings.js";

/** Bumped when a change to this module could change its output for
 * unchanged input. Part of the fingerprint, so a caller can tell "the
 * sources changed" from "the modeler changed". */
export const MODELER_VERSION = "1.0.0";

export type FailureReason =
  /** The item has no type, or no schema was supplied for it. The module
   * does not guess — classification is a later component. */
  | "no-type"
  /** The item has no sources to read. */
  | "no-sources"
  /** Not one attached source could be read. Distinct from
   * `source-unreadable` warnings, which are per-source and survivable. */
  | "no-evidence"
  /** The run exceeded `options.timeout`. */
  | "timeout"
  /** The input is not a usable Item. */
  | "invalid-input"
  /** Something in the module threw where it should not have. */
  | "internal";

export interface ModelingMeta {
  durationMs: number;
  /** Sources attached, read, and skipped for the cap. */
  sources: { attached: number; read: number; skipped: number };
  evidenceBytes: number;
  truncated: boolean;
  claims: { total: number; deterministic: number; languageModel: number; rejected: number };
  modelerVersion: string;
  /**
   * The identity of this run's *inputs*: source fingerprints, the
   * schema, the options that affect output, and the modeler version.
   *
   * Its job is to let a caller skip work — an item whose fingerprint has
   * not moved will model to the same answer, so re-modeling it is
   * pointless. It is not a content hash of the result.
   */
  fingerprint: string;
}

export interface ModelingSuccess {
  status: "modeled";
  /** The same Item, expanded. Never a new object competing with it as
   * the source of truth. */
  item: Item;
  changes: FieldChange[];
  warnings: ModelingWarning[];
  conflicts: ModelingConflict[];
  meta: ModelingMeta;
  /**
   * What the model was shown and what it said, verbatim. Only present
   * under `debugDiagnostics` — it is large and carries source excerpts.
   *
   * The basket rather than a list of rejected candidates, because with
   * one synthesising consumer there are no losing candidates: the
   * question "why does this field say that" is now answered by what was
   * in front of the model, not by who outranked whom.
   */
  diagnostics?: { basket: { key: string; value: string }[]; modelAnswer?: Record<string, unknown> };
}

export interface ModelingFailure {
  status: "failed";
  reason: FailureReason;
  message: string;
  meta: ModelingMeta;
}

export type ItemModelingOutcome = ModelingSuccess | ModelingFailure;

export function isModeled(outcome: ItemModelingOutcome): outcome is ModelingSuccess {
  return outcome.status === "modeled";
}
