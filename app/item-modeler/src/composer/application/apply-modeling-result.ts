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
import type { Data, DataEntry, Item, Schema } from "@index/database/types";
import type { ConflictPolicy } from "../../contracts/modeling-options.js";
import type { FieldChange } from "../../contracts/changes.js";
import type { ModelingConflict } from "../../contracts/conflicts.js";
import { isNamingField } from "../../contracts/resolved-value.js";
import type { ResolvedValue } from "../../contracts/resolved-value.js";
import { hintFor } from "../../contracts/field-hints.js";
import { valuesAgree } from "../normalization/compare-values.js";
import { isBlank } from "../normalization/normalize-value.js";
import { currentValue, ownershipOf, type OwnershipContext } from "./ownership-policy.js";

export interface ApplyRequest {
  item: Item;
  schema: Schema;
  resolved: ResolvedValue[];
  userFields: string[];
  overwriteModeledValues: boolean;
  conflictPolicy: ConflictPolicy;
}

export interface Applied {
  item: Item;
  changes: FieldChange[];
  conflicts: ModelingConflict[];
}

export function applyModelingResult(request: ApplyRequest): Applied {
  const { item, schema, resolved, conflictPolicy } = request;
  const context: OwnershipContext = { item, userFields: request.userFields };

  const changes: FieldChange[] = [];
  const conflicts: ModelingConflict[] = [];
  const writes = new Map<string, DataEntry>();
  let name = item.data.name.value as string;

  for (const entry of resolved) {
    const naming = isNamingField(entry.field, schema);
    const hint = hintFor(entry.field);

    if (naming) {
      const change = applyName(item, entry);
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

/**
 * `name` is the modeler's own field, unconditionally — there is no
 * ownership check here at all. A person's chosen title lives in
 * `display_name` (`captionOf`/`display_name ?? name` at every place the
 * app draws a title), which this module never writes; `name` is free to
 * track whatever the evidence currently says.
 */
function applyName(item: Item, entry: ResolvedValue): FieldChange {
  const found = Array.isArray(entry.value) ? entry.value.join(", ") : entry.value;
  const current = (item.data.name.value as string) ?? "";

  if (current.trim() === found.trim()) {
    return {
      field: entry.field,
      target: "name",
      action: "confirmed",
      before: current,
      provenance: entry.provenance,
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
 * Writes upsert by key — a found field replaces the entry already
 * standing for it rather than landing beside it, the same reason as
 * before, but now a plain object assignment: a freeform tag's key is
 * always a generated id, never a lowercased attribute name, so it can
 * never collide with a named write here.
 */
function writeFields(item: Item, name: string, writes: Map<string, DataEntry>): Item {
  if (writes.size === 0 && name === item.data.name.value) return item;

  // Always "auto": whatever wrote here before, this module just did,
  // and `name`'s provenance has no reader left that cares — the field a
  // person's own choice lives in is `display_name`, untouched by this
  // write.
  const data: Data = { ...item.data, name: { ...item.data.name, value: name, prov: "auto" } };
  for (const [attribute, entry] of writes) data[attribute.toLowerCase()] = entry;

  return { ...item, data };
}
