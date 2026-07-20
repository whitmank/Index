// Authored by Karter Whitman using Claude Opus 4.8
// Migrate kwhitman.xyz's items into Index 0.7 (DESIGN-CONCEPT open item
// #3). Read-only against the xyz store; everything it writes into the
// target is an ordinary, deletable item.
//
//   npx tsx scripts/migrate-xyz.ts \
//     [--source <path to xyz surrealkv db>] \
//     [--target <target rocksdb dir>] [--target-port <n>]
//
// Idempotent: every record it creates has a deterministic `xyz_`-prefixed
// id, and a run first hard-deletes anything it owns from a previous run,
// so re-running converges rather than duplicating. Nothing it does can
// touch a record it did not create.
//
// The mapping:
//   item.title            -> name
//   item.date, created_at -> preserved
//   sources[] (file)      -> resource local://<abs path under data/uploads>
//   sources[] (url)       -> resource <url> (device web)
//   sources[].label       -> resource name
//   fields[]              -> fields[] (kind string; group dropped)
//   types[] (e.g. Movie)  -> a lowercased tag item + item->tag arrow
//   layout {x,y} per date -> position on the item->~ arrow
//   displayImage          -> skipped (node image comes from the primary resource)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Surreal } from "surrealdb";
import {
  applyChange,
  getDb,
  startDatabase,
  HOME_SET_ID,
  type Change,
  type Connection,
  type Field,
  type Item,
  type Resource,
} from "@index/database";

const HOME = process.env.HOME ?? "";
const DEFAULT_SOURCE = "/Users/karter/files/dev/kwhitman.xyz/data/kwhitman.db";
const UPLOADS_DIR = "/Users/karter/files/dev/kwhitman.xyz/data/uploads";
const DEVICE = "local";
const SOURCE_PORT = 8461;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

// ── source (xyz) row shapes ──────────────────────────────────────────────

interface XyzSource {
  type: "file" | "url";
  url: string;
  label?: string | null;
  mimeType?: string | null;
}
interface XyzItem {
  id: unknown;
  title: string;
  date: string;
  created_at: unknown;
  types?: string[];
  fields?: { name: string; value: string; group?: string | null }[];
  sources?: XyzSource[];
}
interface XyzLayout {
  item: unknown;
  space: string;
  x: number;
  y: number;
}

function rawId(recordId: unknown): string {
  const text = String(recordId);
  return text.slice(text.indexOf(":") + 1);
}

// ── target id scheme (deterministic → idempotent) ────────────────────────

const itemId = (xyz: string) => `items:xyz_${xyz}`;
const tagId = (name: string) => `items:xyztag_${slug(name)}`;
const tagArrowId = (xyz: string, name: string) => `connections:xyztagarrow_${xyz}_${slug(name)}`;
const posArrowId = (xyz: string) => `connections:xyzpos_${xyz}`;

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}

// ── transforms ───────────────────────────────────────────────────────────

function resourceOf(source: XyzSource): Resource {
  if (source.type === "file") {
    // /uploads/<uuid>.<ext> → the real file where it already lives.
    const basename = source.url.replace(/^\/?uploads\//, "");
    const absolute = path.join(UPLOADS_DIR, basename);
    return {
      uri: `${DEVICE}://${absolute}`,
      name: source.label ?? basename,
      ...(source.mimeType ? { cached: { mime: source.mimeType } } : {}),
    };
  }
  return { uri: source.url, name: source.label ?? nameFromUrl(source.url) };
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isoOf(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// ── read the source ──────────────────────────────────────────────────────

async function readSource(sourceDir: string): Promise<{ items: XyzItem[]; layout: XyzLayout[] }> {
  // A throwaway copy, so a half-finished read can never touch the original.
  const copy = path.join(path.dirname(sourceDir), "xyz-migrate-src.db");
  fs.rmSync(copy, { recursive: true, force: true });
  fs.cpSync(sourceDir, copy, { recursive: true });

  const child = spawn(
    "surreal",
    ["start", "--bind", `127.0.0.1:${SOURCE_PORT}`, "--user", "root", "--pass", "root", `surrealkv://${copy}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  );

  try {
    await waitForHealth(SOURCE_PORT);
    const db = new Surreal();
    await db.connect(`ws://127.0.0.1:${SOURCE_PORT}/rpc`, {
      namespace: "kwhitman",
      database: "main",
      authentication: { username: "root", password: "root" },
    });
    const [items] = await db
      .query<[XyzItem[]]>("SELECT id, title, date, created_at, types, fields, sources FROM item")
      .collect();
    const [layout] = await db.query<[XyzLayout[]]>("SELECT item, space, x, y FROM layout").collect();
    await db.close();
    return { items, layout };
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("source database did not come up");
}

// ── build the change ─────────────────────────────────────────────────────

function blankItem(id: string, name: string, date: string, createdAt: string): Item {
  return {
    id,
    name,
    display_name: null,
    date,
    created_at: createdAt,
    opens: null,
    query: null,
    system: false,
    fields: [],
    resources: [],
    deleted_at: null,
  };
}

function arrow(id: string, source: string, target: string, createdAt: string): Connection {
  return {
    id,
    source,
    target,
    label: null,
    position: null,
    order: null,
    created_at: createdAt,
    deleted_at: null,
  };
}

function build(items: XyzItem[], layout: XyzLayout[]): Change {
  const positionByItem = new Map(layout.map((row) => [rawId(row.item), { x: row.x, y: row.y }]));

  // Tag items are shared: date each to the earliest item that uses it.
  const tagEarliest = new Map<string, string>();
  for (const item of items) {
    for (const type of item.types ?? []) {
      const name = type.toLowerCase();
      const current = tagEarliest.get(name);
      if (!current || item.date < current) tagEarliest.set(name, item.date);
    }
  }

  const pairs: Change["pairs"] = [];

  for (const [name, date] of tagEarliest) {
    pairs.push({ before: null, after: blankItem(tagId(name), name, date, new Date().toISOString()) });
  }

  for (const source of items) {
    const raw = rawId(source.id);
    const createdAt = isoOf(source.created_at);

    const item = blankItem(itemId(raw), source.title, source.date, createdAt);
    item.resources = (source.sources ?? []).map(resourceOf);
    item.fields = (source.fields ?? []).map<Field>((field) => ({
      name: field.name,
      value: field.value,
      kind: "string",
    }));
    pairs.push({ before: null, after: item });

    // types[0] is primary; stagger created_at so the cascade reads it first.
    (source.types ?? []).forEach((type, index) => {
      const name = type.toLowerCase();
      const at = new Date(new Date(createdAt).getTime() + index).toISOString();
      pairs.push({ before: null, after: arrow(tagArrowId(raw, name), item.id, tagId(name), at) });
    });

    // The xyz layout position → a positioned arrow into ~, which is what
    // a ~ timeline day-page reads.
    const position = positionByItem.get(raw);
    if (position) {
      pairs.push({
        before: null,
        after: { ...arrow(posArrowId(raw), item.id, HOME_SET_ID, createdAt), position },
      });
    }
  }

  return { description: "Import from kwhitman.xyz", pairs };
}

// ── idempotency: clear a previous run ────────────────────────────────────

async function clearPreviousRun(): Promise<{ items: number; connections: number }> {
  const db = getDb();
  const [connections, items] = await db
    .query<[unknown[], unknown[]]>(
      `DELETE connections WHERE string::starts_with(record::id(id), 'xyz') RETURN BEFORE;
       DELETE items WHERE string::starts_with(record::id(id), 'xyz') RETURN BEFORE;`,
    )
    .collect();
  return { items: items.length, connections: connections.length };
}

// ── run ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sourceDir = arg("source", DEFAULT_SOURCE);
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));

  console.log(`[migrate] source: ${sourceDir}`);
  console.log(`[migrate] target: ${targetDir} (port ${targetPort})`);

  const { items, layout } = await readSource(sourceDir);
  console.log(`[migrate] read ${items.length} items, ${layout.length} positions from xyz`);

  const handle = await startDatabase({ directory: targetDir, port: targetPort });
  try {
    const cleared = await clearPreviousRun();
    if (cleared.items || cleared.connections) {
      console.log(`[migrate] cleared a previous run: ${cleared.items} items, ${cleared.connections} connections`);
    }

    const change = build(items, layout);
    await applyChange(change);

    const created = change.pairs.length;
    const tags = new Set(
      change.pairs.flatMap((pair) =>
        pair.after && pair.after.id.startsWith("items:xyztag_") ? [pair.after.id] : [],
      ),
    ).size;
    console.log(`[migrate] wrote ${created} records — ${items.length} items, ${tags} tags, and their arrows`);
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
