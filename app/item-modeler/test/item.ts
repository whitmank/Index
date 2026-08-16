// Authored by Karter Whitman using Claude Opus 5
// A complete Item, for tests and for the evaluation harness.
//
// Shared rather than duplicated because `Item` carries a dozen fields
// that modeling never looks at — a date, a display name, a query, a
// created-at — and every one of them still has to be present for the
// value to be an Item. A cast would hide that; when a field is added to
// the wire shape, this file should fail to compile.
import path from "node:path";
import type { Item } from "@index/database/types";

export interface ItemOptions extends Partial<Item> {
  type?: string | null;
}

/**
 * An item carrying one source and nothing else.
 *
 * Deliberately empty of fields: the evaluation must model from the source
 * alone, so nothing it produces can have leaked in from the answer key.
 */
export function itemFor(uri: string, overrides: ItemOptions = {}): Item {
  const name = /^[a-z]+:\/\//i.test(uri) ? uri : path.basename(uri);
  return {
    id: `items:${name}`,
    name,
    display_name: null,
    date: "2026-08-13",
    created_at: "2026-08-13T00:00:00Z",
    opens: null,
    query: null,
    system: false,
    is_set: false,
    type: "book",
    type_source: "user",
    fields: [],
    resources: [{ uri, name }],
    deleted_at: null,
    ...overrides,
  };
}
