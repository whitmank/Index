// Authored by Karter Whitman using Claude Opus 4.8
// The two items that exist before the user does anything (PRODUCT-SPEC
// §1.4). Seeding runs at every launch and only ever creates what is
// missing — the seeds are ordinary editable items once they exist, and a
// launch must not undo an edit to one.
import { getDb } from "./db.js";
import {
  TIMELINE_DIRECTION_FIELD,
  TIMELINE_PARTITION_FIELD,
} from "./records/items.js";
import { recordId } from "./records/serialize.js";
import { HOME_SET_ID, PUBLIC_SET_ID } from "./types.js";

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const SEEDS = [
  {
    id: HOME_SET_ID,
    name: "All",
    // Everything belongs to this set (its id is still `~`); it is the
    // application's home, titled "All" for the set list.
    query: { all: true },
    fields: [
      { name: TIMELINE_PARTITION_FIELD, value: "date", kind: "string" },
      { name: TIMELINE_DIRECTION_FIELD, value: "forward", kind: "string" },
    ],
  },
  {
    id: PUBLIC_SET_ID,
    name: "public",
    // Explicit membership only: the make-public toggle writes the arrow.
    query: undefined,
    fields: [
      { name: TIMELINE_PARTITION_FIELD, value: "created_at", kind: "string" },
      { name: TIMELINE_DIRECTION_FIELD, value: "backward", kind: "string" },
    ],
  },
] as const;

export async function seed(): Promise<void> {
  const db = getDb();
  const date = today();

  for (const record of SEEDS) {
    await db
      .query(
        `LET $existing = (SELECT VALUE id FROM $id);
         IF array::len($existing) = 0 THEN
           (CREATE $id CONTENT {
             name: $name,
             date: $date,
             opens: "timeline",
             system: true,
             query: $query,
             fields: $fields,
             resources: []
           })
         END;`,
        {
          id: recordId(record.id),
          name: record.name,
          date,
          query: record.query,
          fields: record.fields,
        },
      )
      .collect();
  }
}
