// Authored by Karter Whitman using Claude Sonnet 5
// One-time sweep for an album import's own field rename: `expandSpotifyAlbum`
// (app/frontend/src/lib/spotify.ts) used to write a plain string `"Year"`
// field; it now writes a full `YYYY-MM-DD` `"Date"` field (kind `date`,
// shown at `year` precision) instead, and cleans up `year` itself on any
// *new* import — but an album already sitting in the store from before that
// change only gets cleaned up if you re-attach its Spotify link. This is the
// one-time version of that same cleanup, run once over every row instead of
// waiting on each album to be touched again by hand.
//
// For each item still carrying a `data.year` entry that matches exactly
// what that old code wrote (`attribute: "Year"`, `kind: "string"`,
// `prov: "auto"`, a bare 4-digit value) — anything else under that key is
// left alone, since it was never this integration's to begin with:
//   - no `data.date` yet: the year becomes one, padded to `YYYY-01-01`
//     the same way `padReleaseDate` already pads a bare year at import time.
//   - `data.date` already there (a re-attach already ran): `year` is just
//     dropped as the stale duplicate it is.
//
//   npx tsx scripts/migrate-album-year-to-date.ts [--target <dir>] [--target-port <n>]
//
// Run with the app closed: this spawns its own `surreal` against the same
// RocksDB directory the app uses. Idempotent — every row this touches ends
// up with no `year` key at all, so a second run finds nothing left to do.
import path from "node:path";
import { getDb, startDatabase } from "@index/database";

const HOME = process.env.HOME ?? "";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

interface DataEntry {
  attribute?: string | null;
  value: string | string[];
  kind: string;
  prov: string;
}

interface ItemRow {
  id: unknown;
  data: Record<string, DataEntry>;
}

async function main(): Promise<void> {
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));

  console.log(`[migrate] target: ${targetDir} (port ${targetPort})`);

  const handle = await startDatabase({ directory: targetDir, port: targetPort });
  try {
    const db = getDb();
    const [items] = await db
      .query<[ItemRow[]]>(`SELECT id, data FROM items WHERE deleted_at IS NONE AND data.year IS NOT NONE`)
      .collect();

    let renamed = 0;
    let dropped = 0;
    let skipped = 0;

    for (const row of items) {
      const year = row.data.year;
      const isOwnYearField =
        year &&
        year.attribute?.toLowerCase() === "year" &&
        year.kind === "string" &&
        year.prov === "auto" &&
        typeof year.value === "string" &&
        /^\d{4}$/.test(year.value);

      if (!isOwnYearField) {
        skipped += 1;
        continue;
      }

      const nextData = { ...row.data };
      delete nextData.year;

      if (nextData.date) {
        dropped += 1;
      } else {
        nextData.date = { attribute: "Date", value: `${year.value}-01-01`, kind: "date", prov: "auto" };
        renamed += 1;
      }

      await db.query(`UPDATE $id SET data = $data`, { id: row.id, data: nextData }).collect();
    }

    console.log(
      `[migrate] renamed ${renamed} year field(s) to date, dropped ${dropped} stale duplicate(s), skipped ${skipped} unrelated "year" field(s)`,
    );
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
