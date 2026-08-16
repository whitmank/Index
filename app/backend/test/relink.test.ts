// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for services/relink.ts: hashing, the bounded
// walker/search, and the reconcile/relink flow against a real throwaway
// SurrealDB instance — same shape as @index/database's own
// records.test.ts, since this is the same kind of thing (no Electron, a
// scratch store, one pass asserting reads after every step).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyChange,
  getItem,
  HOME_SET_ID,
  itemId,
  startDatabase,
  type Change,
  type Item,
} from "@index/database";
import { sha256File } from "../src/services/hash.js";
import { pathToUri } from "../src/services/intake.js";
import { findByHash, isExcluded, relinkOne } from "../src/services/relink.js";

const TEST_PORT = 8498;
const store = fs.mkdtempSync(path.join(os.tmpdir(), "index-db-test-"));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "index-relink-test-"));

let passed = 0;

function check(what: string, assertion: () => void): void {
  assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

async function checkAsync(what: string, assertion: () => Promise<void>): Promise<void> {
  await assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

function blankItem(overrides: Partial<Item> = {}): Item {
  return {
    id: itemId(),
    name: "",
    display_name: null,
    description: null,
    date: "2026-07-20",
    created_at: new Date().toISOString(),
    opens: null,
    query: null,
    system: false,
    is_set: false,
    type: null,
    type_source: null,
    fields: [],
    resources: [],
    deleted_at: null,
    ...overrides,
  };
}

function write(filepath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, contents);
}

async function main(): Promise<void> {
  console.log("\nhashing");
  const fixture = path.join(scratch, "fixture.txt");
  write(fixture, "letters to a young poet");
  await checkAsync("sha256File matches a known digest", async () => {
    const hash = await sha256File(fixture);
    assert.equal(hash, "7ce408e8ae4abe911a6e216eeb8304875176359e82ebe31642fd19862755ea4f");
    assert.equal(hash, await sha256File(fixture));
  });

  console.log("\nwalker / findByHash");
  const haystack = path.join(scratch, "haystack");
  write(path.join(haystack, "decoy.txt"), "not it");
  write(path.join(haystack, "node_modules", "junk.txt"), "letters to a young poet");
  write(path.join(haystack, ".hidden", "junk.txt"), "letters to a young poet");
  write(path.join(haystack, "nested", "deep", "book.epub"), "letters to a young poet");
  fs.symlinkSync(haystack, path.join(haystack, "nested", "loop"));

  const targetHash = await sha256File(fixture);
  const targetSize = fs.statSync(fixture).size;

  await checkAsync("finds the file by content, skipping node_modules/dotfiles/symlink loops", async () => {
    const found = await findByHash(targetHash, targetSize, haystack);
    assert.equal(found, path.join(haystack, "nested", "deep", "book.epub"));
  });

  await checkAsync("returns null when nothing matches", async () => {
    const found = await findByHash("0".repeat(64), targetSize, haystack);
    assert.equal(found, null);
  });

  const dupes = path.join(scratch, "duplicates");
  write(path.join(dupes, "old-copy.epub"), "letters to a young poet");
  await new Promise((resolve) => setTimeout(resolve, 50));
  write(path.join(dupes, "new-copy.epub"), "letters to a young poet");

  await checkAsync("with duplicate content, prefers the more recently touched copy", async () => {
    const found = await findByHash(targetHash, targetSize, dupes);
    assert.equal(found, path.join(dupes, "new-copy.epub"));
  });

  console.log("\nisExcluded");
  check("matches the folder itself and anything nested under it", () => {
    assert.equal(isExcluded("/Users/k/files/dev", ["/Users/k/files/dev"]), true);
    assert.equal(isExcluded("/Users/k/files/dev/index-workspace", ["/Users/k/files/dev"]), true);
  });
  check("does not match a sibling folder that merely shares a prefix", () => {
    // "/Users/k/filesystem" starts with "/Users/k/files" as plain text,
    // but isn't nested under it — the path-separator boundary is what
    // tells the two apart.
    assert.equal(isExcluded("/Users/k/filesystem", ["/Users/k/files"]), false);
  });
  check("does not match an unrelated folder", () => {
    assert.equal(isExcluded("/Users/k/Documents", ["/Users/k/files/dev"]), false);
  });

  console.log("\nreconcile + relinkOne");
  const handle = await startDatabase({ directory: store, port: TEST_PORT });

  try {
    const original = path.join(scratch, "original", "letters.epub");
    write(original, "letters to a young poet");

    const book = blankItem({
      name: "Letters to a Young Poet",
      resources: [{ uri: pathToUri(original), name: "letters.epub" }],
    });
    await applyChange({ description: "Create item", pairs: [{ before: null, after: book }] });

    const relocated = path.join(scratch, "relocated", "letters.epub");
    write(relocated, "letters to a young poet");
    const entry = {
      itemId: book.id,
      uri: pathToUri(original),
      contentHash: targetHash,
      size: targetSize,
    };

    const records = await relinkOne(entry, relocated);
    check("relinkOne applied a change", () => {
      assert.ok(records && records.length === 1);
    });

    const relinked = await getItem(book.id);
    check("the item now points at the new path", () => {
      assert.equal(relinked?.resources[0]?.uri, pathToUri(relocated));
      assert.equal(relinked?.resources[0]?.name, "letters.epub");
    });

    const again = await relinkOne(entry, relocated);
    check("relinking an already-fixed resource no-ops (uri no longer matches)", () => {
      assert.equal(again, null);
    });

    console.log("\nconcurrency guard");
    const second = blankItem({
      name: "Duplicate target",
      resources: [{ uri: pathToUri(path.join(scratch, "missing-2.epub")), name: "missing-2.epub" }],
    });
    await applyChange({ description: "Create item", pairs: [{ before: null, after: second }] });
    const raceEntry = {
      itemId: second.id,
      uri: pathToUri(path.join(scratch, "missing-2.epub")),
      contentHash: targetHash,
      size: targetSize,
    };
    const raceTarget = path.join(scratch, "race-found.epub");
    write(raceTarget, "letters to a young poet");

    const [first, racer] = await Promise.all([
      relinkOne(raceEntry, raceTarget),
      relinkOne(raceEntry, raceTarget),
    ]);
    check("only one concurrent relink attempt for the same resource wins", () => {
      const wins = [first, racer].filter((result) => result !== null);
      assert.equal(wins.length, 1);
    });

    console.log(`\n${passed} assertions passed\n`);
  } finally {
    await handle.stop();
  }
}

main()
  .catch((error) => {
    console.error("\n✗ ", error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(store, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });
