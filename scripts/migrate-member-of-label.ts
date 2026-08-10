// Authored by Karter Whitman using Claude Sonnet 5
// One-time backfill for the member-of refinement: every set's membership
// — every tag, every public toggle — used to be a live `label: null`
// connection, back when unlabelled meant "belongs." Going forward, only
// the reserved `member of` label is structural (PLAYS_SET_ROLE,
// records/items.ts); unlabelled is just a plain, nonstructural
// relationship — a canvas edge drawn free-hand, say. This relabels every
// currently-unlabelled connection to `member of`, so every real
// container keeps working exactly as it did.
//
// It cannot tell a legitimate membership arrow from an accidental one —
// a stray canvas edge that happened to land on something and made it
// register as a place it was never meant to be. That still needs to be
// found and cleaned up by hand, same as always; this only stops it from
// happening to anything new.
//
//   npx tsx scripts/migrate-member-of-label.ts [--target <dir>] [--target-port <n>]
//
// Run with the app closed: this spawns its own `surreal` against the
// same RocksDB directory the app uses. Idempotent — a second run finds
// nothing left to relabel.
import path from "node:path";
import { getDb, startDatabase, MEMBER_OF_LABEL_ID } from "@index/database";

const HOME = process.env.HOME ?? "";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

async function main(): Promise<void> {
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));

  console.log(`[migrate] target: ${targetDir} (port ${targetPort})`);

  const handle = await startDatabase({ directory: targetDir, port: targetPort });
  try {
    const db = getDb();
    const [rows] = await db
      .query<[unknown[]]>(
        `UPDATE connections SET label = ${MEMBER_OF_LABEL_ID}
         WHERE label IS NONE AND deleted_at IS NONE
         RETURN BEFORE;`,
      )
      .collect();
    console.log(`[migrate] relabelled ${rows.length} unlabelled connection(s) to 'member of'`);
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
