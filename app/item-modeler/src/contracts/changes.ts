// Authored by Karter Whitman using Claude Opus 5
// What the run did, field by field — the audit trail (§7 Apply updates).
//
// The change set is a first-class return value rather than a log, because
// the caller decides what to do with it: preview it, ask the user to
// approve it, turn it into an Index `Change` and apply it, or throw it
// away. `modelItem` never persists, so this is the whole of what it has
// to say about what it would have written.
import type { MetadataEntry } from "@index/database/types";
import type { FieldProvenance } from "./provenance.js";

/**
 * The seven outcomes the spec distinguishes. They are kept apart because
 * collapsing them loses the thing a reader wants to know — "filled in"
 * and "agreed with what was already there" are both success and are not
 * the same event.
 *
 * - `populated` — a previously empty field received a supported value.
 * - `normalized` — an existing value changed only into a canonical
 *   equivalent. The fact did not change; its spelling did.
 * - `confirmed` — evidence supports what was already there. Nothing was
 *   written. This is what makes a second run over an unchanged item
 *   produce no `populated` actions, which is the spec's idempotency test.
 * - `replaced` — a modeled value was superseded by stronger evidence.
 *   Never applies to a user value.
 * - `skipped` — a claim was deliberately not applied, and `reason` says
 *   why: a user owns the field, or the policy forbids overwriting.
 * - `conflicted` — evidence disagrees with what is there. The existing
 *   value stands and the disagreement is recorded (see conflicts.ts);
 *   the module does not resolve it silently.
 * - `cleared` — a prior modeled value was removed because it failed
 *   validation or lost its support.
 */
export type ChangeAction =
  | "populated"
  | "normalized"
  | "confirmed"
  | "replaced"
  | "skipped"
  | "conflicted"
  | "cleared";

export interface FieldChange {
  /** The schema field, or the naming field when `target` is "name". */
  field: string;
  /** Which part of the Item this touches. The name is not a row, so it
   * cannot be described as one. */
  target: "field" | "name";
  action: ChangeAction;
  before?: MetadataEntry["value"];
  after?: MetadataEntry["value"];
  /** Present whenever a value was written or confirmed — the answer to
   * "why does it say that". Absent on a `skipped` with no candidate. */
  provenance?: FieldProvenance;
  /** Short, human-readable, and only where the action alone does not
   * explain itself: which policy skipped this, what failed validation. */
  reason?: string;
}

/** Did this run actually change the Item? A run of nothing but
 * `confirmed` and `skipped` did not, which is what "semantically empty"
 * means when the spec asks for idempotency. */
export function isMaterial(change: FieldChange): boolean {
  return (
    change.action === "populated" ||
    change.action === "normalized" ||
    change.action === "replaced" ||
    change.action === "cleared"
  );
}
