// Authored by Karter Whitman using Claude Opus 4.8
// Row ⇄ wire shape. Everything SurrealDB-specific about a record's
// representation is confined here: record ids arrive as objects and leave
// as StringRecordId, datetimes arrive as dates and leave as ISO strings,
// and `option<T>` fields are NONE (absent) rather than null — so writes
// pass `undefined`, never `null`, or the field's type check fails.
import { StringRecordId } from "surrealdb";
import type {
  Connection,
  Field,
  Item,
  Label,
  Position,
  Resource,
  SetQuery,
  StoredRecord,
} from "../types.js";
import { isItem } from "../types.js";

export interface ItemRow {
  id: unknown;
  name: string;
  display_name?: string | null;
  date: string;
  created_at: unknown;
  opens?: string | null;
  query?: SetQuery | null;
  system?: boolean;
  fields?: Field[];
  resources?: Resource[];
  deleted_at?: unknown;
}

export interface ConnectionRow {
  id: unknown;
  in: unknown;
  out: unknown;
  label?: unknown;
  position?: Position | null;
  order?: number | null;
  created_at: unknown;
  deleted_at?: unknown;
}

export interface LabelRow {
  id: unknown;
  name: string;
}

/** SurrealDB's own record-id rendering is the canonical wire id: it
 * escapes exactly the ids that need escaping (`items:⟨~⟩`) and leaves
 * ULIDs alone, so ids minted in `ids.ts` round-trip unchanged. */
export function idToString(raw: unknown): string {
  return String(raw);
}

function dateToString(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function optionalDate(raw: unknown): string | null {
  return raw === undefined || raw === null ? null : dateToString(raw);
}

export function serializeItem(row: ItemRow): Item {
  return {
    id: idToString(row.id),
    name: row.name ?? "",
    display_name: row.display_name ?? null,
    date: row.date,
    created_at: dateToString(row.created_at),
    opens: row.opens ?? null,
    query: row.query ?? null,
    system: row.system ?? false,
    fields: row.fields ?? [],
    resources: row.resources ?? [],
    deleted_at: optionalDate(row.deleted_at),
  };
}

export function serializeConnection(row: ConnectionRow): Connection {
  return {
    id: idToString(row.id),
    source: idToString(row.in),
    target: idToString(row.out),
    label: row.label === undefined || row.label === null ? null : idToString(row.label),
    position: row.position ?? null,
    order: row.order ?? null,
    created_at: dateToString(row.created_at),
    deleted_at: optionalDate(row.deleted_at),
  };
}

export function serializeLabel(row: LabelRow): Label {
  return { id: idToString(row.id), name: row.name };
}

export function recordId(wireId: string): StringRecordId {
  return new StringRecordId(wireId);
}

function toDbDate(value: string | null): Date | undefined {
  return value === null ? undefined : new Date(value);
}

/** The content half of a write. `id` is passed separately; `created_at`
 * is READONLY in the schema, so it is only sent on creation — SurrealDB
 * rejects an attempt to change it. */
export function itemContent(item: Item, includeCreatedAt: boolean): Record<string, unknown> {
  return {
    name: item.name,
    display_name: item.display_name ?? undefined,
    date: item.date,
    ...(includeCreatedAt ? { created_at: new Date(item.created_at) } : {}),
    opens: item.opens ?? undefined,
    query: item.query ?? undefined,
    system: item.system,
    fields: item.fields.map((field) => ({
      name: field.name,
      value: field.value,
      kind: field.kind,
    })),
    resources: item.resources.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      cached: resource.cached ?? undefined,
    })),
    deleted_at: toDbDate(item.deleted_at),
  };
}

export function connectionContent(
  connection: Connection,
  includeCreatedAt: boolean,
): Record<string, unknown> {
  return {
    in: recordId(connection.source),
    out: recordId(connection.target),
    label: connection.label === null ? undefined : recordId(connection.label),
    position: connection.position ?? undefined,
    order: connection.order ?? undefined,
    ...(includeCreatedAt ? { created_at: new Date(connection.created_at) } : {}),
    deleted_at: toDbDate(connection.deleted_at),
  };
}

export function recordContent(
  record: StoredRecord,
  includeCreatedAt: boolean,
): Record<string, unknown> {
  return isItem(record)
    ? itemContent(record, includeCreatedAt)
    : connectionContent(record, includeCreatedAt);
}
