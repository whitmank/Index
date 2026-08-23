// Authored by Karter Whitman using Claude Sonnet 5
// The two items that exist before the user does anything (PRODUCT-SPEC
// §1.4). Seeding runs at every launch and only ever creates what is
// missing — the seeds are ordinary editable items once they exist, and a
// launch must not undo an edit to one.
import { getDb } from "./db.js";
import {
  TIMELINE_DIRECTION_FIELD,
  TIMELINE_PARTITION_FIELD,
} from "./sets/membership.js";
import { recordId } from "./records/serialize.js";
import type { Data, SetState } from "./types.js";
import { HOME_SET_ID, MEMBER_OF_LABEL_ID, PUBLIC_SET_ID } from "./types.js";

const SEEDS: { id: string; set: SetState; data: Data }[] = [
  {
    id: HOME_SET_ID,
    // Everything belongs to this set (its id is still `~`); it is the
    // application's home, titled "All" for the set list. It has a real
    // filter from birth, so `set` carries the query rather than the
    // bootstrap `true` state.
    set: { all: true },
    data: {
      name: { attribute: "name", value: "All", kind: "string", prov: "auto" },
      timeline_partition: { attribute: TIMELINE_PARTITION_FIELD, value: "date_added", kind: "string", prov: "auto" },
      timeline_direction: { attribute: TIMELINE_DIRECTION_FIELD, value: "forward", kind: "string", prov: "auto" },
    },
  },
  {
    id: PUBLIC_SET_ID,
    // Explicit membership only: the make-public toggle writes the arrow.
    // No filter, so `set` stays the deliberate-set bootstrap state.
    set: true,
    data: {
      name: { attribute: "name", value: "public", kind: "string", prov: "auto" },
      timeline_partition: { attribute: TIMELINE_PARTITION_FIELD, value: "created_at", kind: "string", prov: "auto" },
      timeline_direction: { attribute: TIMELINE_DIRECTION_FIELD, value: "backward", kind: "string", prov: "auto" },
    },
  },
];

export async function seed(): Promise<void> {
  const db = getDb();

  for (const record of SEEDS) {
    await db
      .query(
        `LET $existing = (SELECT VALUE id FROM $id);
         IF array::len($existing) = 0 THEN
           (CREATE $id CONTENT {
             set: $set,
             data: $data,
             resources: []
           })
         END;`,
        { id: recordId(record.id), set: record.set, data: record.data },
      )
      .collect();
  }

  // The reserved structural label, seeded once with a well-known id —
  // the set-role check (sets/membership.ts, records/connections.ts)
  // reads it by that id directly rather than minting it on first tag,
  // the same reason `~` and `public` are seeded rather than created
  // lazily.
  await db
    .query(
      `LET $existing = (SELECT VALUE id FROM $id);
       IF array::len($existing) = 0 THEN
         (CREATE $id CONTENT { name: $name })
       END;`,
      { id: recordId(MEMBER_OF_LABEL_ID), name: "member of" },
    )
    .collect();
}
