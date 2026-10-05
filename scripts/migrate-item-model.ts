// Authored by Karter Whitman using Claude Sonnet 5
// The combined migration for the item/schema data model redesign
// (docs/ITEM-MODEL-REDESIGN-PLAN.md). Replaces the never-run
// scripts/migrate-date-fields.ts — per Karter's "migrate once, at the
// end" direction, everything pending gets folded into this one pass:
//
//   1. date_added absorbs the old `date` (journal day) and, more
//      precisely, the old `created_at` (immutable, absorbed since it is
//      strictly more precise than a day-only value).
//   2. items.type: "book" + type_source: "auto" -> type: { value, prov }.
//   3. items.fields[] -> items.metadata[] (name -> attribute, + prov).
//   4. schemas.fields[] -> schemas.attributes[] (name -> attribute,
//      label dropped, hidden inverted to display).
//
//   npx tsx scripts/migrate-item-model.ts [--target <dir>] [--target-port <n>]
//
// Run with the app closed: this spawns its own `surreal` against the
// same RocksDB directory the app uses.
//
// Idempotent per row: a row that already carries `date_added` is
// considered migrated and is skipped entirely, both for items and for
// schemas (keyed on `attributes` there). A second run finds nothing left
// to do.
//
// [pinned here] Does NOT go through @index/database's `startDatabase()`.
// That helper always applies the package's *current* schema.surql —
// already the new shape — and then runs `seed()`, which includes a
// long-standing, permanent backfill (`UPDATE items SET is_set = true
// WHERE opens IN [...]`, unrelated to this migration) that touches
// *every* row matching that WHERE. SurrealDB validates a row's *whole*
// stored document on any write to it, not just the fields a statement
// names — proven against a copy of the real store, where exactly this
// happened: 8 real items still carry a legacy `opens` value, none of
// them yet reshaped, and `seed()`'s backfill died on the first one
// ("Expected `array` but found `NONE`" for the new, still-unpopulated
// `metadata` field) before this script's own migration logic ever ran.
// So this script owns its own connection start-to-finish and never lets
// `seed()` run until every row is already compliant — at which point
// the app's own next launch runs it safely, same as always.
//
// No additive safety net otherwise. Unlike the `date` split, `type` and
// `fields`/`metadata` are reshaped *in place* — the field name is
// reused for a new shape — so once the new schema is live over a store,
// any further write to a row this script hasn't reshaped yet fails
// outright, for the reason above. Every write below is a full `CONTENT`
// replace — never a partial `SET` — carrying every current field
// forward so nothing already on the row is lost, and dropping whatever
// the new schema no longer declares (`date`, `type_source`, the old
// `fields`/`label`/`hidden`) in the same step.
//
// `date_added` is READONLY under the shipped schema, which blocks
// exactly the write this script has to make — the *first* time a row
// gets a value there. So this script relaxes it for the duration of the
// items pass and restores it before exiting, even on failure; the
// restored definition is byte-for-byte what schema.surql already
// declares, so the app's own next launch is a no-op against it.
//
// Tested against a copy of ~/.index/surreal before ever pointing this
// at the real directory — see the plan's Phase 5 for why, and do the
// same before running this for real.
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { Surreal } from "surrealdb";
import { TIMELINE_PARTITION_FIELD } from "@index/database";

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

// ── old row shapes, read raw — untyped, so a dropped/renamed field def
// never stops these from reading whatever is actually still on disk. ──

interface OldItemRow {
  id: unknown;
  name: string;
  display_name?: string | null;
  description?: string | null;
  date?: string | null;
  date_added?: unknown;
  date_created?: unknown;
  created_at?: unknown;
  opens?: string | null;
  query?: unknown;
  system?: boolean;
  is_set?: boolean;
  type?: unknown;
  type_source?: string | null;
  fields?: { name: string; value: string | string[]; kind: string }[];
  resources?: unknown[];
  deleted_at?: unknown;
}

interface OldSchemaRow {
  id: unknown;
  name: string;
  attributes?: unknown;
  fields?: { name: string; kind: string; hidden?: boolean }[];
}

/** Content for a full `UPDATE $id CONTENT $content` — every current
 * field, reshaped where the model changed and passed through untouched
 * everywhere else. A partial `SET` cannot do this job: SurrealDB
 * validates the whole stored document on any write, so a row still
 * carrying `date`/`type_source`/the old `fields` fails any write once
 * those field defs are gone, unless the same write also drops them —
 * which only a full replace does. */
function reshapeItem(row: OldItemRow): Record<string, unknown> {
  const dateAdded = row.created_at ?? (row.date ? new Date(row.date) : new Date());
  const rawType = row.type;
  const type =
    typeof rawType === "string" && rawType
      ? { value: rawType, prov: row.type_source === "user" ? "user" : "auto" }
      : undefined;

  const metadata = (row.fields ?? []).map((field) => ({
    attribute: field.name,
    // `~`'s own timeline_partition sentinel named the old field by
    // value ("date"); repoint it so the home timeline keeps paging the
    // same way it always has.
    value:
      field.name === TIMELINE_PARTITION_FIELD && field.value === "date" ? "date_added" : field.value,
    kind: field.kind,
    prov: "auto",
  }));

  return {
    name: row.name,
    display_name: row.display_name ?? undefined,
    description: row.description ?? undefined,
    date_added: dateAdded,
    date_created: row.date_created ?? undefined,
    opens: row.opens ?? undefined,
    query: row.query ?? undefined,
    system: row.system ?? false,
    is_set: row.is_set ?? false,
    type,
    metadata,
    resources: row.resources ?? [],
    deleted_at: row.deleted_at ?? undefined,
  };
}

function reshapeSchema(row: OldSchemaRow): Record<string, unknown> {
  const attributes = (row.fields ?? []).map((field) => ({
    attribute: field.name,
    kind: field.kind,
    display: !field.hidden,
  }));
  return { name: row.name, attributes };
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
      // *not* followed by `seed()` (see the header comment): that has to
      // wait until every row below is actually compliant with it.
      await db.query(schemaDDL()).collect();

      // schema.surql is additive-only by design (`OVERWRITE`, never
      // `REMOVE` — the point is that re-running it never touches
      // existing rows). That means a field this redesign drops or
      // renames is never actually un-defined just by shipping new code:
      // its old `DEFINE FIELD` — proven against a copy of the real
      // store — is still live on the server from the last time the old
      // app ran, still enforcing its old (non-optional, defaulted)
      // shape, and still rejecting any write that doesn't supply it.
      // This is the one-time cleanup schema.surql itself can never do.
      await db
        .query(
          `REMOVE FIELD date ON items;
           REMOVE FIELD type_source ON items;
           REMOVE FIELD fields ON items;
           REMOVE FIELD fields.* ON items;
           REMOVE FIELD fields.*.name ON items;
           REMOVE FIELD fields.*.value ON items;
           REMOVE FIELD fields.*.value.* ON items;
           REMOVE FIELD fields.*.kind ON items;
           REMOVE FIELD created_at ON items;
           REMOVE INDEX items_date ON items;
           REMOVE INDEX items_created ON items;
           REMOVE FIELD label ON schemas;
           REMOVE FIELD fields ON schemas;
           REMOVE FIELD fields.* ON schemas;
           REMOVE FIELD fields.*.name ON schemas;
           REMOVE FIELD fields.*.label ON schemas;
           REMOVE FIELD fields.*.kind ON schemas;
           REMOVE FIELD fields.*.hidden ON schemas;`,
        )
        .collect();

      await db
        .query(`DEFINE FIELD OVERWRITE date_added ON items TYPE datetime DEFAULT time::now();`)
        .collect();

      const [items] = await db
        .query<[OldItemRow[]]>(
          `SELECT id, name, display_name, description, date, date_added, date_created, created_at,
                  opens, query, system, is_set, type, type_source, fields, resources, deleted_at
           FROM items`,
        )
        .collect();

      let migratedItems = 0;
      for (const row of items) {
        if (row.date_added) continue; // already migrated
        await db.query(`UPDATE $id CONTENT $content`, { id: row.id, content: reshapeItem(row) }).collect();
        migratedItems += 1;
      }
      console.log(`[migrate] reshaped ${migratedItems} item(s) (of ${items.length})`);

      // Restored to exactly what schema.surql already declares — the
      // app's own next launch re-applies the identical definition, a
      // no-op.
      await db
        .query(`DEFINE FIELD OVERWRITE date_added ON items TYPE datetime DEFAULT time::now() READONLY;`)
        .collect();

      const [schemas] = await db
        .query<[OldSchemaRow[]]>(`SELECT id, name, attributes, fields FROM schemas`)
        .collect();

      let migratedSchemas = 0;
      for (const row of schemas) {
        if (row.attributes) continue; // already migrated
        await db.query(`UPDATE $id CONTENT $content`, { id: row.id, content: reshapeSchema(row) }).collect();
        migratedSchemas += 1;
      }
      console.log(`[migrate] reshaped ${migratedSchemas} schema(s) (of ${schemas.length})`);

      console.log(
        "[migrate] every row now matches the new schema — the app's own next launch will seed and run normally.",
      );
    } finally {
      // Belt and suspenders: if anything above threw after the relax but
      // before the restore, put READONLY back before this process exits —
      // an app launch against a permanently-relaxed date_added would
      // silently accept edits to a field that is supposed to be immutable.
      await db
        .query(`DEFINE FIELD OVERWRITE date_added ON items TYPE datetime DEFAULT time::now() READONLY;`)
        .collect()
        .catch(() => {});
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
