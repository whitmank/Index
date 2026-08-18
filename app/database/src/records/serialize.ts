// Authored by Karter Whitman using Claude Opus 4.8
// Row ⇄ wire shape. Everything SurrealDB-specific about a record's
// representation is confined here: record ids arrive as objects and leave
// as StringRecordId, datetimes arrive as dates and leave as ISO strings,
// and `option<T>` fields are NONE (absent) rather than null — so writes
// pass `undefined`, never `null`, or the field's type check fails.
import { StringRecordId } from "surrealdb";
import type {
  Connection,
  Item,
  ItemType,
  Label,
  MetadataEntry,
  Position,
  Resource,
  Schema,
  SchemaAttribute,
  SetQuery,
  StoredRecord,
} from "../types.js";
import { isItem } from "../types.js";

export interface ItemRow {
  id: unknown;
  name: string;
  display_name?: string | null;
  description?: string | null;
  date_added: unknown;
  date_created?: unknown;
  opens?: string | null;
  query?: SetQuery | null;
  system?: boolean;
  is_set?: boolean;
  type?: ItemType | null;
  metadata?: MetadataEntry[];
  resources?: Resource[];
  deleted_at?: unknown;
}

export interface SchemaRow {
  id: unknown;
  name: string;
  attributes?: SchemaAttribute[];
}

export interface ConnectionRow {
  id: unknown;
  in: unknown;
  out: unknown;
  label?: unknown;
  position?: Position | null;
  order?: number | null;
  child?: boolean;
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
    description: row.description ?? null,
    date_added: dateToString(row.date_added),
    date_created: optionalDate(row.date_created),
    opens: row.opens ?? null,
    query: row.query ?? null,
    system: row.system ?? false,
    is_set: row.is_set ?? false,
    type: row.type ?? null,
    metadata: row.metadata ?? [],
    resources: row.resources ?? [],
    deleted_at: optionalDate(row.deleted_at),
  };
}

export function serializeSchema(row: SchemaRow): Schema {
  return {
    id: idToString(row.id),
    name: row.name,
    attributes: row.attributes ?? [],
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
    child: row.child ?? false,
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

/** The content half of a write. `id` is passed separately; `date_added`
 * is READONLY in the schema, so it is only sent on creation — SurrealDB
 * rejects an attempt to change it. */
export function itemContent(item: Item, includeCreatedAt: boolean): Record<string, unknown> {
  return {
    name: item.name,
    display_name: item.display_name ?? undefined,
    description: item.description ?? undefined,
    ...(includeCreatedAt ? { date_added: new Date(item.date_added) } : {}),
    date_created: toDbDate(item.date_created),
    opens: item.opens ?? undefined,
    query: item.query ?? undefined,
    system: item.system,
    is_set: item.is_set,
    type: item.type
      ? { value: item.type.value, prov: item.type.prov }
      : undefined,
    metadata: item.metadata.map((entry) => ({
      attribute: entry.attribute ?? undefined,
      value: entry.value,
      kind: entry.kind,
      prov: entry.prov,
    })),
    resources: item.resources.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      contentHash: resource.contentHash ?? undefined,
      size: resource.size ?? undefined,
      cached: resource.cached ?? undefined,
    })),
    deleted_at: toDbDate(item.deleted_at),
  };
}

/** The content half of a schema write. Schemas sit outside the change
 * model — like labels, there is nothing about one to undo — so this has
 * no `includeCreatedAt`-style split; a schema has no immutable field. */
export function schemaContent(schema: Pick<Schema, "name" | "attributes">): Record<string, unknown> {
  return {
    name: schema.name,
    attributes: schema.attributes.map((attribute) => ({
      attribute: attribute.attribute,
      kind: attribute.kind,
      display: attribute.display,
    })),
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
    child: connection.child,
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
