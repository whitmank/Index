// Authored by Karter Whitman using Claude Sonnet 5
// One-time cleanup for a gap in `expandSpotifyAlbum` (app/frontend/src/lib/spotify.ts):
// before this fix, refetching an album's Spotify data (the FocusToolbar
// "refetch" button, or re-attaching the same link) minted a fresh set of
// song items and connections every time, instead of matching the ones
// already there by track url. An album refetched N times ended up with
// N copies of every track nested under it.
//
// For every album, groups its live `child: true` connections by the
// resource url the target song carries (a track's own url is stable
// across every fetch, the same identity the fixed integration now
// matches on). A group of more than one is a duplicate set: one survives
// — whichever was renamed by hand (`data.name.prov === "user"`), or
// failing that the oldest by `date_added` — and the rest are soft-deleted
// along with the connection that nested each one, the same shape
// `deleteMany` (changes/catalog.ts) already writes for any other delete.
//
//   npx tsx scripts/dedupe-spotify-songs.ts [--target <dir>] [--target-port <n>]
//
// Run with the app closed: this spawns its own `surreal` against the
// same RocksDB directory the app uses. Idempotent — every group this
// touches ends up with exactly one live song in it, so a second run
// finds nothing left to remove.
import path from "node:path";
import { getDb, startDatabase } from "@index/database";

const HOME = process.env.HOME ?? "";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

interface ItemRow {
  id: unknown;
  date_added: unknown;
  deleted_at: unknown;
  data: { type?: { value?: string }; name?: { value?: string; prov?: string } };
  resources: { uri: string }[];
}

interface ConnectionRow {
  id: unknown;
  in: unknown;
  out: unknown;
  child: boolean;
  deleted_at: unknown;
}

async function main(): Promise<void> {
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));

  console.log(`[dedupe] target: ${targetDir} (port ${targetPort})`);

  const handle = await startDatabase({ directory: targetDir, port: targetPort });
  try {
    const db = getDb();

    const [items] = await db
      .query<[ItemRow[]]>(`SELECT id, date_added, deleted_at, data.type, data.name, resources FROM items`)
      .collect();
    const [connections] = await db
      .query<[ConnectionRow[]]>(`SELECT id, in, out, child, deleted_at FROM connections WHERE child = true`)
      .collect();

    const itemsById = new Map(items.map((item) => [String(item.id), item]));
    const liveChildConnectionsByParent = new Map<string, ConnectionRow[]>();
    for (const connection of connections) {
      if (connection.deleted_at) continue;
      const parentId = String(connection.in);
      const list = liveChildConnectionsByParent.get(parentId) ?? [];
      list.push(connection);
      liveChildConnectionsByParent.set(parentId, list);
    }

    const at = new Date();
    let removed = 0;
    let albumsAffected = 0;

    for (const [parentId, childConnections] of liveChildConnectionsByParent) {
      const parent = itemsById.get(parentId);
      if (!parent || parent.deleted_at) continue;
      if ((parent.data.type?.value ?? "").toLowerCase() !== "album") continue;

      const byUrl = new Map<string, { connection: ConnectionRow; song: ItemRow }[]>();
      for (const connection of childConnections) {
        const song = itemsById.get(String(connection.out));
        if (!song || song.deleted_at) continue;
        const uri = song.resources?.[0]?.uri;
        if (!uri) continue;
        const group = byUrl.get(uri) ?? [];
        group.push({ connection, song });
        byUrl.set(uri, group);
      }

      let touchedThisAlbum = false;
      for (const group of byUrl.values()) {
        if (group.length <= 1) continue;
        touchedThisAlbum = true;

        const renamed = group.find((entry) => entry.song.data.name?.prov === "user");
        const oldest = [...group].sort((a, b) =>
          String(a.song.date_added).localeCompare(String(b.song.date_added)),
        )[0];
        const keeper = renamed ?? oldest;

        for (const entry of group) {
          if (entry === keeper) continue;
          await db.query(`UPDATE $id SET deleted_at = $at`, { id: entry.song.id, at }).collect();
          await db.query(`UPDATE $id SET deleted_at = $at`, { id: entry.connection.id, at }).collect();
          removed += 1;
        }
      }
      if (touchedThisAlbum) albumsAffected += 1;
    }

    console.log(`[dedupe] removed ${removed} duplicate song(s) across ${albumsAffected} album(s)`);
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error("[dedupe] failed:", error);
  process.exit(1);
});
