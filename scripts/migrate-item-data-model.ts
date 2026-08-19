// Authored by Karter Whitman using Claude Sonnet 5
// The combined migration for the item data model redesign
// (docs/ITEM-DATA-MODEL-PLAN.md): app state vs. resource data. Reshapes
// every item row from the flat `name`/`display_name`/`description`/
// `date_created`/`opens`/`query`/`system`/`is_set`/`type`/`metadata`
// shape into `layout`/`set`/`data`:
//
//   1. name/display_name/description/date_created/type become entries
//      inside `data`, keyed by their own attribute name.
//   2. Every old `metadata[]` entry becomes a `data` entry too — named
//      ones keyed by `attribute.toLowerCase()`, freeform (null-attribute)
//      ones keyed by a freshly minted ulid.
//   3. `opens` -> `layout` (null becomes the literal "default").
//   4. `query`/`is_set` collapse into `set` (a real query wins; else
//      `is_set` becomes the bootstrap `true`; else `false`).
//   5. `system` is dropped — computed from `id` going forward
//      (isSystemId in @index/database/types), never stored.
//
//   npx tsx scripts/migrate-item-data-model.ts [--target <dir>] [--target-port <n>]
//
// Run with the app closed: this spawns its own `surreal` against the
// same RocksDB directory the app uses.
//
// Idempotent per row: a row that already carries `data` is considered
// migrated and is skipped entirely. A second run finds nothing left to
// do.
//
// [pinned here] Follows scripts/migrate-item-model.ts's own established
// pattern exactly, for the same reasons that script documents: does NOT
// go through @index/database's `startDatabase()`/`seed()` — this owns
// its own connection, applies the package's current schema.surql itself,
// and only then reshapes every row, so nothing else touches a row before
// this script has made it compliant. `date_added` needs no READONLY
// relax this time — verified directly against a live SurrealDB instance
// that writing a `CONTENT` back with a READONLY field's *unchanged*
// value succeeds (the field only rejects an actual change), and every
// row here passes its own existing `date_added` straight through.
//
// No additive safety net: `type`, `metadata`, `opens`, `query`,
// `system`, `is_set` are dropped and folded into `data`/`layout`/`set`
// in place, so once the new schema is live over a store, any further
// write to a row this script hasn't reshaped yet fails outright (the old
// field defs still enforce their old, now-unsatisfiable shape until
// explicitly removed below). Every write is a full `CONTENT` replace —
// never a partial `SET` — carrying every current field forward.
//
// Test against a copy of ~/.index/surreal before ever pointing this at
// the real directory — see the plan's Phase 5 for why, and do the same
// before running this for real.
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { Surreal } from "surrealdb";
import { ulid } from "@index/database";

const require = createRequire(import.meta.url);
const HOME = process.env.HOME ?? "";
const HOST = "127.0.0.1";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

function schemaDDL(): string {
  return fs.readFileSync(require.resolve("@index/database/schema.surql"), "utf8");
}

async function waitForReady(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${HOST}:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`SurrealDB did not become ready on port ${port}: ${String(lastError)}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  await new Promise<void>((resolve) => {
    const kill = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("close", () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

// ── the old row shape, read raw — untyped enough that a dropped/renamed
// field def never stops this from reading whatever is actually still on
// disk. ──

interface OldMetadataEntry {
  attribute: string | null;
  value: string | string[];
  kind: string;
  prov?: string;
}

interface OldItemRow {
  id: unknown;
  name: string;
  display_name?: string | null;
  description?: string | null;
  date_added: unknown;
  date_created?: unknown;
  opens?: string | null;
  query?: unknown;
  is_set?: boolean;
  type?: { value: string; prov?: string } | null;
  metadata?: OldMetadataEntry[];
  resources?: unknown[];
  deleted_at?: unknown;
  data?: unknown; // present only once already migrated
}

function dateToString(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function prov(value: string | undefined): "auto" | "user" {
  return value === "user" ? "user" : "auto";
}

/** Content for a full `UPDATE $id CONTENT $content` — every current
 * field, reshaped where the model changed and passed through untouched
 * everywhere else. A partial `SET` cannot do this job: SurrealDB
 * validates the whole stored document on any write, so a row still
 * carrying `opens`/`query`/`system`/`is_set`/`type`/`metadata` fails any
 * write once those field defs are gone, unless the same write also drops
 * them — which only a full replace does. */
function reshapeItem(row: OldItemRow): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: { attribute: "name", value: row.name, kind: "string", prov: "user" },
  };
  if (row.display_name) {
    data.display_name = { attribute: "display_name", value: row.display_name, kind: "string", prov: "user" };
  }
  if (row.description) {
    data.description = { attribute: "description", value: row.description, kind: "string", prov: "user" };
  }
  if (row.date_created) {
    data.date_created = {
      attribute: "date_created",
      value: dateToString(row.date_created).slice(0, 10),
      kind: "date",
      prov: "user",
    };
  }
  if (row.type) {
    data.type = { attribute: "type", value: row.type.value, kind: "string", prov: prov(row.type.prov) };
  }
  for (const entry of row.metadata ?? []) {
    const key = entry.attribute ? entry.attribute.toLowerCase() : ulid();
    data[key] = {
      attribute: entry.attribute ?? undefined,
      value: entry.value,
      kind: entry.kind,
      prov: prov(entry.prov),
    };
  }

  const set = row.query !== undefined && row.query !== null ? row.query : row.is_set ? true : false;

  return {
    date_added: row.date_added,
    layout: row.opens ?? "default",
    set,
    data,
    resources: row.resources ?? [],
    deleted_at: row.deleted_at ?? undefined,
  };
}

async function main(): Promise<void> {
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));

  console.log(`[migrate] target: ${targetDir} (port ${targetPort})`);

  fs.mkdirSync(targetDir, { recursive: true });
  const child = spawn(
    "surreal",
    ["start", "--bind", `${HOST}:${targetPort}`, "--user", "root", "--pass", "root", `rocksdb://${targetDir}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  try {
    const spawnFailed = new Promise<never>((_resolve, reject) => {
      child.once("error", (error) => reject(new Error(`could not spawn surreal: ${error.message}`)));
    });
    await Promise.race([waitForReady(targetPort), spawnFailed]);

    const db = new Surreal();
    await db.connect(`ws://${HOST}:${targetPort}/rpc`, {
      namespace: "index",
      database: "main",
      authentication: { username: "root", password: "root" },
    });

    try {
      // The package's current schema — already the new shape. Deliberately
      // *not* followed by `seed()`: that has to wait until every row below
      // is actually compliant with it.
      await db.query(schemaDDL()).collect();

      // schema.surql is additive-only by design (`OVERWRITE`, never
      // `REMOVE`), so a field this redesign drops or renames is never
      // actually un-defined just by shipping new code — its old
      // `DEFINE FIELD` is still live from the last time the old app ran,
      // still enforcing its old shape, and still rejecting any write
      // that doesn't supply it. This is the one-time cleanup
      // schema.surql itself can never do.
      await db
        .query(
          `REMOVE FIELD display_name ON items;
           REMOVE FIELD description ON items;
           REMOVE FIELD date_created ON items;
           REMOVE FIELD opens ON items;
           REMOVE FIELD query ON items;
           REMOVE FIELD system ON items;
           REMOVE FIELD is_set ON items;
           REMOVE FIELD type ON items;
           REMOVE FIELD type.value ON items;
           REMOVE FIELD type.prov ON items;
           REMOVE FIELD metadata ON items;
           REMOVE FIELD metadata.* ON items;
           REMOVE FIELD metadata.*.attribute ON items;
           REMOVE FIELD metadata.*.value ON items;
           REMOVE FIELD metadata.*.kind ON items;
           REMOVE FIELD metadata.*.prov ON items;
           REMOVE FIELD name ON items;
           REMOVE INDEX items_date_created ON items;`,
        )
        .collect();

      const [items] = await db
        .query<[OldItemRow[]]>(
          `SELECT id, name, display_name, description, date_added, date_created,
                  opens, query, system, is_set, type, metadata, resources, deleted_at, data
           FROM items`,
        )
        .collect();

      let migratedItems = 0;
      for (const row of items) {
        if (row.data) continue; // already migrated
        await db.query(`UPDATE $id CONTENT $content`, { id: row.id, content: reshapeItem(row) }).collect();
        migratedItems += 1;
      }
      console.log(`[migrate] reshaped ${migratedItems} item(s) (of ${items.length})`);

      console.log(
        "[migrate] every row now matches the new schema — the app's own next launch will seed and run normally.",
      );
    } finally {
      await db.close().catch(() => {});
    }
  } finally {
    await stop(child);
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
