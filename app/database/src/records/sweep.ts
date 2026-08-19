// Authored by Karter Whitman using Claude Opus 4.8
// The two reads and one write the GC needs. They live here because every
// SurrealQL query in the project does; the policy — how old is old
// enough, how often to sweep — belongs to the backend's gc service.
import { getDb } from "../db.js";
import { recordId } from "./serialize.js";
import { HOME_SET_ID, PUBLIC_SET_ID } from "../types.js";

export interface Purge {
  items: number;
  connections: number;
}

/**
 * Hard-delete records flagged before `cutoff`. System items are exempt:
 * they refuse deletion in the first place, and this is the backstop that
 * says so twice.
 */
export async function purgeDeletedBefore(cutoff: Date): Promise<Purge> {
  const db = getDb();
  const [connections, items] = await db
    .query<[unknown[], unknown[]]>(
      `DELETE connections WHERE deleted_at != NONE AND deleted_at < $cutoff RETURN BEFORE;
       DELETE items WHERE deleted_at != NONE AND deleted_at < $cutoff AND id != $home AND id != $public RETURN BEFORE;`,
      { cutoff, home: recordId(HOME_SET_ID), public: recordId(PUBLIC_SET_ID) },
    )
    .collect();
  return { items: items.length, connections: connections.length };
}

/**
 * Every uri a cached derivation is keyed to and still worth keeping: a
 * resource's own uri (a device's file), and a link resource's preview
 * image and favicon (fetched from and keyed to *their* urls, not the
 * page's — `derivations.ts`'s `thumbnail` caches either kind the same
 * way).
 */
export async function listLiveResourceUris(): Promise<string[]> {
  const db = getDb();
  const [uriRows, previewRows, faviconRows] = await db
    .query<[string[][], (string | null)[][], (string | null)[][]]>(
      `SELECT VALUE resources.*.uri FROM items WHERE deleted_at IS NONE;
       SELECT VALUE resources.*.cached.preview_image FROM items WHERE deleted_at IS NONE;
       SELECT VALUE resources.*.cached.favicon FROM items WHERE deleted_at IS NONE;`,
    )
    .collect();
  const uris = new Set<string>();
  for (const row of [...uriRows, ...previewRows, ...faviconRows]) {
    for (const uri of row ?? []) if (uri) uris.add(uri);
  }
  return [...uris];
}
