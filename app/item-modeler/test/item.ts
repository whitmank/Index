// Authored by Karter Whitman using Claude Opus 5
// A complete Item, for tests and for the evaluation harness.
//
// Shared rather than duplicated because `Item` carries a dozen fields
// that modeling never looks at — a date, a display name, a query, a
// created-at — and every one of them still has to be present for the
// value to be an Item. A cast would hide that; when a field is added to
// the wire shape, this file should fail to compile.
import path from "node:path";
import { ulid } from "@index/database";
import type { Data, DataEntry, Item } from "@index/database/types";

export interface ItemOptions {
  /** Overrides the derived name. */
  name?: string;
  /** A plain type name — this file wraps it into `{ value, prov: "user" }`
   * so tests do not have to spell out the provenance every time. `null`
   * means untyped; `undefined` means "book", the default every test not
   * about typing itself doesn't have to restate. */
  type?: string | null;
  /** Named attributes/tags, deliberately not `data` itself: this file
   * still owns building `data.name`/`data.type` from `name`/`type`
   * above, so a caller only has to say what's extra. */
  entries?: DataEntry[];
  resources?: Item["resources"];
}

/**
 * An item carrying one source and nothing else.
 *
 * Deliberately empty of data: the evaluation must model from the
 * source alone, so nothing it produces can have leaked in from the
 * answer key.
 */
export function itemFor(uri: string, overrides: ItemOptions = {}): Item {
  const derivedName = /^[a-z]+:\/\//i.test(uri) ? uri : path.basename(uri);
  const name = overrides.name ?? derivedName;

  const data: Data = { name: { attribute: "name", value: name, kind: "string", prov: "user" } };
  if (overrides.type !== null) {
    data.type = { attribute: "type", value: overrides.type ?? "book", kind: "string", prov: "user" };
  }
  for (const entry of overrides.entries ?? []) {
    data[entry.attribute ? entry.attribute.toLowerCase() : ulid()] = entry;
  }

  return {
    id: `items:${derivedName}`,
    date_added: "2026-08-13T00:00:00Z",
    layout: "default",
    set: false,
    data,
    resources: overrides.resources ?? [{ uri, name: derivedName }],
    deleted_at: null,
  };
}
