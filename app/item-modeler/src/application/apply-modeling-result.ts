// Authored by Karter Whitman using Claude Opus 5
// Resolved values → an updated Item and the change set that explains it.
//
// The only place the Item is written. Everything upstream produces
// candidates; this decides, and every decision it makes becomes a
// `FieldChange` — including the decisions to do nothing, which is what
// makes `confirmed` and `skipped` first-class rather than silence.
//
// Unchanged by the move to synthesis, and worth noting as such: ownership
// precedence is about the *user*, not about which reader spoke. A value
// the user entered is never overwritten whether the challenger came from
// a package document or a language model, and the seven actions describe
// the same seven outcomes either way.
//
// The Item comes back as the same Item, expanded. No parallel "parsed
// model" is returned to compete with it as the source of truth: the spec
// is emphatic about this, and it is why the function takes an Item and
// returns an Item rather than a bag of fields somebody else has to merge.
import type { Item, MetadataEntry, Schema } from "@index/database/types";
import type { ConflictPolicy } from "../contracts/modeling-options.js";
import type { FieldChange } from "../contracts/changes.js";
import type { ModelingConflict } from "../contracts/conflicts.js";
import { isNamingField } from "../contracts/resolved-value.js";
import type { ResolvedValue } from "../contracts/resolved-value.js";
import { hintFor } from "../normalization/field-hints.js";
import { valuesAgree } from "../normalization/compare-values.js";
import { isBlank } from "../normalization/normalize-value.js";
import {
  currentValue,
  mayRename,
  ownershipOf,
  type OwnershipContext,
} from "./ownership-policy.js";

export interface ApplyRequest {
  item: Item;
  schema: Schema;
  resolved: ResolvedValue[];
  userFields: string[];
  derivedName: string | null;
  overwriteModeledValues: boolean;
  conflictPolicy: ConflictPolicy;
}

export interface Applied {
  item: Item;
  changes: FieldChange[];
  conflicts: ModelingConflict[];
}

/** Rows are matched case-insensitively, like every other name in the
 * app. A null attribute is a freeform tag, never a named target — it
 * never matches and is left alone. */
function sameField(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

export function applyModelingResult(request: ApplyRequest): Applied {
  const { item, schema, resolved, conflictPolicy } = request;
  const context: OwnershipContext = { item, userFields: request.userFields };

  const changes: FieldChange[] = [];
  const conflicts: ModelingConflict[] = [];
  const writes = new Map<string, MetadataEntry>();
  let name = item.name;

  for (const entry of resolved) {
    const naming = isNamingField(entry.field, schema);
    const hint = hintFor(entry.field);

    if (naming) {
      const change = applyName(item, entry, request.derivedName);
      if (change.action === "populated" || change.action === "normalized") {
        name = change.after as string;
      }
      changes.push(change);
      continue;
    }

    const existing = currentValue(item, entry.field);
    const ownership = ownershipOf(entry.field, context);

    if (ownership === "empty") {
      writes.set(entry.field, { attribute: entry.field, value: entry.value, kind: entry.kind, prov: "auto" });
      changes.push({
        field: entry.field,
        target: "field",
        action: "populated",
        after: entry.value,
        provenance: entry.provenance,
      });
      continue;
    }

    const agrees = existing !== undefined && valuesAgree(existing, entry.value, hint);

    if (agrees) {
      // The same fact, better written — worth taking even from a user's
      // field, because it does not change what the item says. An isbn-10
      // becoming its isbn-13, a date gaining its month.
      const identical = JSON.stringify(existing) === JSON.stringify(entry.value);
      if (identical || ownership === "user") {
        changes.push({
          field: entry.field,
          target: "field",
          action: "confirmed",
          before: existing,
          provenance: entry.provenance,
        });
        continue;
      }
      writes.set(entry.field, { attribute: entry.field, value: entry.value, kind: entry.kind, prov: "auto" });
      changes.push({
        field: entry.field,
        target: "field",
        action: "normalized",
        before: existing,
        after: entry.value,
        provenance: entry.provenance,
      });
      continue;
    }

    if (ownership === "user") {
      changes.push({
        field: entry.field,
        target: "field",
        action: "conflicted",
        before: existing,
        after: entry.value,
        provenance: entry.provenance,
        reason: "the field carries a value this run did not put there",
      });
      if (conflictPolicy === "record" && existing !== undefined) {
        conflicts.push({
          field: entry.field,
          incumbent: {
            value: existing,
            provenance: {
              origin: "user",
              sourceIds: [],
              method: "user-entered",
              at: new Date(0).toISOString(),
            },
          },
          challengers: [{ value: entry.value, provenance: entry.provenance }],
          reason: "evidence disagrees with the value already on the item",
        });
      }
      continue;
    }

    // A previously modeled value, and evidence that says otherwise.
    if (!request.overwriteModeledValues) {
      changes.push({
        field: entry.field,
        target: "field",
        action: "skipped",
        before: existing,
        after: entry.value,
        provenance: entry.provenance,
        reason: "overwriteModeledValues is off",
      });
      continue;
    }
    writes.set(entry.field, { attribute: entry.field, value: entry.value, kind: entry.kind, prov: "auto" });
    changes.push({
      field: entry.field,
      target: "field",
      action: "replaced",
      before: existing,
      after: entry.value,
      provenance: entry.provenance,
    });
  }

  return { item: writeFields(item, name, writes), changes, conflicts };
}

function applyName(item: Item, entry: ResolvedValue, derivedName: string | null): FieldChange {
  const found = Array.isArray(entry.value) ? entry.value.join(", ") : entry.value;
  const current = item.name ?? "";

  if (current.trim() === found.trim()) {
    return {
      field: entry.field,
      target: "name",
      action: "confirmed",
      before: current,
      provenance: entry.provenance,
    };
  }

  if (!mayRename(item, derivedName)) {
    return {
      field: entry.field,
      target: "name",
      action: "skipped",
      before: current,
      after: found,
      provenance: entry.provenance,
      reason: "the item has a name of its own",
    };
  }

  return {
    field: entry.field,
    target: "name",
    action: isBlank(current) ? "populated" : "normalized",
    before: current,
    after: found,
    provenance: entry.provenance,
  };
}

/**
 * A found field replaces the row already standing for it rather than
 * landing beside it — the layout draws a type's declared attributes
 * whether or not they carry anything, so appending would show the name
 * twice with one of them empty.
 */
function writeFields(item: Item, name: string, writes: Map<string, MetadataEntry>): Item {
  if (writes.size === 0 && name === item.name) return item;

  const existing = item.metadata ?? [];
  const replaced = existing.map((entry) => {
    for (const [target, written] of writes) {
      if (sameField(entry.attribute, target)) return { ...written, attribute: entry.attribute };
    }
    return entry;
  });

  const added = [...writes.entries()]
    .filter(([target]) => !existing.some((entry) => sameField(entry.attribute, target)))
    .map(([, written]) => written);

  return { ...item, name, metadata: [...replaced, ...added] };
}
