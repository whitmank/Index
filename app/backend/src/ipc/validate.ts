// Authored by Karter Whitman using Claude Opus 4.8
// Handlers validate what crosses the bridge (PRODUCT-SPEC §2.2). The
// renderer is ours, so this is not a trust boundary so much as a place
// for a malformed change to fail loudly and locally instead of becoming a
// confusing SurrealDB error three layers down.
import type {
  Change,
  ChangePair,
  FieldKind,
  MembersOptions,
  SchemaField,
  StoredRecord,
} from "@index/database/types";
import type { SchemaInput } from "@index/database";

export class InvalidInput extends Error {}

function fail(what: string): never {
  throw new InvalidInput(what);
}

export function asString(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  return value;
}

export function asStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail(`${what} must be an array of strings`);
  }
  return value as string[];
}

export function asOptionalNumber(value: unknown, what: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${what} must be a number`);
  return value;
}

export function asMembersOptions(value: unknown): MembersOptions {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") fail("options must be an object");

  const { partition } = value as { partition?: unknown };
  if (partition === undefined) return {};
  if (typeof partition !== "object" || partition === null) fail("partition must be an object");

  return { partition: { date: asString((partition as { date: unknown }).date, "partition.date") } };
}

const FIELD_KINDS: FieldKind[] = ["string", "number", "date", "list"];

function asFieldKind(value: unknown, what: string): FieldKind {
  if (typeof value !== "string" || !FIELD_KINDS.includes(value as FieldKind)) {
    fail(`${what} must be one of ${FIELD_KINDS.join(", ")}`);
  }
  return value as FieldKind;
}

function asOptionalString(value: unknown, what: string): string | null {
  if (value === undefined || value === null) return null;
  return asString(value, what);
}

function asSchemaField(value: unknown, what: string): SchemaField {
  if (typeof value !== "object" || value === null) fail(`${what} must be an object`);
  const { name, label, kind, hidden } = value as {
    name?: unknown;
    label?: unknown;
    kind?: unknown;
    hidden?: unknown;
  };
  if (hidden !== undefined && typeof hidden !== "boolean") {
    fail(`${what}.hidden must be a boolean`);
  }
  // Rebuilds the field rather than passing it through, so anything not
  // named here is dropped on the way across the bridge. That is the
  // point, and it is also the trap: a new property has to be added here
  // too or it silently never arrives.
  return {
    name: asString(name, `${what}.name`),
    label: asOptionalString(label, `${what}.label`),
    kind: asFieldKind(kind, `${what}.kind`),
    hidden: hidden === true,
  };
}

export function asSchemaInput(value: unknown): SchemaInput {
  if (typeof value !== "object" || value === null) fail("schema must be an object");
  const { name, label, fields } = value as { name?: unknown; label?: unknown; fields?: unknown };
  if (asString(name, "schema.name").trim() === "") fail("schema.name must not be blank");
  if (!Array.isArray(fields)) fail("schema.fields must be an array");

  return {
    name: asString(name, "schema.name"),
    label: asOptionalString(label, "schema.label"),
    fields: fields.map((field, index) => asSchemaField(field, `schema.fields[${index}]`)),
  };
}

function asRecord(value: unknown, what: string): StoredRecord | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") fail(`${what} must be a record or null`);
  const { id } = value as { id?: unknown };
  if (typeof id !== "string" || !/^(items|connections):/.test(id)) {
    fail(`${what}.id must name an item or a connection`);
  }
  return value as StoredRecord;
}

export function asChange(value: unknown): Change {
  if (typeof value !== "object" || value === null) fail("change must be an object");
  const { description, pairs } = value as { description?: unknown; pairs?: unknown };
  if (!Array.isArray(pairs) || pairs.length === 0) fail("change.pairs must be a non-empty array");

  const validated: ChangePair[] = pairs.map((pair, index) => {
    if (typeof pair !== "object" || pair === null) fail(`change.pairs[${index}] must be an object`);
    const { before, after } = pair as { before?: unknown; after?: unknown };
    const validatedPair: ChangePair = {
      before: asRecord(before, `change.pairs[${index}].before`),
      after: asRecord(after, `change.pairs[${index}].after`),
    };
    if (!validatedPair.before && !validatedPair.after) {
      fail(`change.pairs[${index}] says nothing: both sides are null`);
    }
    return validatedPair;
  });

  return { description: asString(description, "change.description"), pairs: validated };
}
