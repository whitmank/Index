// Authored by Karter Whitman using Claude Opus 4.8
// The two reads and one write the GC needs. They live here because every
// SurrealQL query in the project does; the policy — how old is old
// enough, how often to sweep — belongs to the backend's gc service.
import { getDb } from "../db.js";

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
       DELETE items WHERE deleted_at != NONE AND deleted_at < $cutoff AND system = false RETURN BEFORE;`,
      { cutoff },
    )
    .collect();
  return { items: items.length, connections: connections.length };
}

/** Every resource uri still pointed at by a live item — the set a cached
 * derivation has to belong to in order to be worth keeping. */
export async function listLiveResourceUris(): Promise<string[]> {
  const db = getDb();
  const [rows] = await db
    .query<[string[][]]>("SELECT VALUE resources.*.uri FROM items WHERE deleted_at IS NONE")
    .collect();
  const uris = new Set<string>();
  for (const row of rows) {
    for (const uri of row ?? []) uris.add(uri);
  }
  return [...uris];
}
