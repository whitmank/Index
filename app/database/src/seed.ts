// Authored by Karter Whitman using Claude Sonnet 5
// The two items that exist before the user does anything (PRODUCT-SPEC
// §1.4). Seeding runs at every launch and only ever creates what is
// missing — the seeds are ordinary editable items once they exist, and a
// launch must not undo an edit to one.
//
// It also carries one idempotent backfill (below): view kind used to be
// remembered per set (`opens` naming "canvas"/"list"/"timeline"), which
// doubled as how an empty set stayed visible on the home screen before it
// had a query or any members. View kind is now a global, application-
// level toggle instead (store/viewMode.ts) — `opens` no longer means
// anything to a set — so a pre-existing empty set recognized only that
// way needs the dedicated `is_set` flag instead, or it silently
// disappears from the home screen the moment it has no members.
import { getDb } from "./db.js";
import {
  TIMELINE_DIRECTION_FIELD,
  TIMELINE_PARTITION_FIELD,
} from "./records/items.js";
import { recordId } from "./records/serialize.js";
import { HOME_SET_ID, MEMBER_OF_LABEL_ID, PUBLIC_SET_ID } from "./types.js";

const SEEDS = [
  {
    id: HOME_SET_ID,
    name: "All",
    // Everything belongs to this set (its id is still `~`); it is the
    // application's home, titled "All" for the set list.
    query: { all: true },
    metadata: [
      { attribute: TIMELINE_PARTITION_FIELD, value: "date_added", kind: "string", prov: "auto" },
      { attribute: TIMELINE_DIRECTION_FIELD, value: "forward", kind: "string", prov: "auto" },
    ],
  },
  {
    id: PUBLIC_SET_ID,
    name: "public",
    // Explicit membership only: the make-public toggle writes the arrow.
    query: undefined,
    metadata: [
      { attribute: TIMELINE_PARTITION_FIELD, value: "created_at", kind: "string", prov: "auto" },
      { attribute: TIMELINE_DIRECTION_FIELD, value: "backward", kind: "string", prov: "auto" },
    ],
  },
] as const;

export async function seed(): Promise<void> {
  const db = getDb();

  for (const record of SEEDS) {
    await db
      .query(
        `LET $existing = (SELECT VALUE id FROM $id);
         IF array::len($existing) = 0 THEN
           (CREATE $id CONTENT {
             name: $name,
             is_set: true,
             system: true,
             query: $query,
             metadata: $metadata,
             resources: []
           })
         END;`,
        {
          id: recordId(record.id),
          name: record.name,
          query: record.query,
          metadata: record.metadata,
        },
      )
      .collect();
  }

  // The reserved structural label, seeded once with a well-known id —
  // `PLAYS_SET_ROLE` (records/items.ts) reads it by that id directly
  // rather than minting it on first tag, the same reason `~` and
  // `public` are seeded rather than created lazily.
  await db
    .query(
      `LET $existing = (SELECT VALUE id FROM $id);
       IF array::len($existing) = 0 THEN
         (CREATE $id CONTENT { name: $name })
       END;`,
      { id: recordId(MEMBER_OF_LABEL_ID), name: "member of" },
    )
    .collect();

  await db
    .query(
      // No `is_set = false` guard: on a pre-existing row the field is
      // simply absent (NONE, not the boolean false — it didn't exist
      // when the row was written), and `NONE = false` doesn't match.
      // Setting it true again on a row that already has it is a no-op,
      // so the guard bought nothing anyway.
      `UPDATE items SET is_set = true
       WHERE opens IN ['timeline', 'canvas', 'list'];`,
    )
    .collect();
}
