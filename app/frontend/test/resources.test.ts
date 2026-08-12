// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for lib/resources.ts — the rule about when an
// item's type may be guessed again. It is worth pinning because every
// clause of it is a decision that reads as arbitrary from the code alone:
// which resource counts as the subject, which guesses are allowed to
// overwrite what, and which are refused.
import assert from "node:assert/strict";
import type { Item, Resource } from "@index/database/types";

let passed = 0;

async function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  await assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

/** What the bridge was asked, so a test can assert it was not asked. */
const asked: string[] = [];
let answer: string | null = null;

// Stubbed before lib/resources.ts is loaded — it reads `window.index` at
// call time, but the module graph under it expects a browser global.
(globalThis as { window?: unknown }).window = {
  index: {
    ingest: {
      classify: async (uri: string) => {
        asked.push(uri);
        return { ok: { type: answer } };
      },
    },
  },
};

const { attachResource, detachResource, moveResource } = await import(
  "../src/lib/resources.js"
);

function resource(name: string): Resource {
  return { uri: `mbp:///Users/k/${name}`, name };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "items:01TEST",
    name: "Dune",
    display_name: null,
    date: "2026-08-12",
    created_at: "2026-08-12T00:00:00.000Z",
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

/** The item as a change leaves it. */
function outcome(change: { pairs: { after: unknown }[] }): Item {
  return change.pairs[0]?.after as Item;
}

function reset(guess: string | null): void {
  asked.length = 0;
  answer = guess;
}

console.log("\nthe first resource is the subject");

await check("classifies the resource that becomes an untyped item's primary", async () => {
  reset("book");
  const after = outcome(await attachResource(item(), resource("dune.epub")));

  assert.deepEqual(asked, ["mbp:///Users/k/dune.epub"]);
  assert.equal(after.type, "book");
  assert.equal(after.type_source, "auto");
});

await check("never classifies a resource appended behind the primary", async () => {
  reset("book");
  const film = item({ type: "movie", type_source: "auto", resources: [resource("dune.mp4")] });
  const after = outcome(await attachResource(film, resource("dune.epub")));

  // The IMDb-page case: a supplementary source says nothing about what
  // the item fundamentally is, so it is never asked about.
  assert.deepEqual(asked, []);
  assert.equal(after.type, "movie");
  assert.equal(after.resources.length, 2);
});

await check("classifies again when a different resource is promoted to primary", async () => {
  reset("movie");
  const page = item({ type: "link", type_source: "auto" });
  page.resources = [resource("dune-imdb.html"), resource("dune.mp4")];
  const after = outcome(await moveResource(page, 1, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/dune.mp4"]);
  assert.equal(after.type, "movie");
  assert.equal(after.type_source, "auto");
  assert.equal(after.resources[0]?.name, "dune.mp4");
});

await check("does not classify a reorder that leaves the primary alone", async () => {
  reset("movie");
  const film = item({ type: "movie", type_source: "auto" });
  film.resources = [resource("dune.mp4"), resource("a.html"), resource("b.html")];
  await moveResource(film, 2, 1);

  assert.deepEqual(asked, []);
});

await check("classifies whatever a removed primary was standing in front of", async () => {
  reset("book");
  const film = item({ type: "movie", type_source: "auto" });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const after = outcome(await detachResource(film, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/dune.epub"]);
  assert.equal(after.type, "book");
});

console.log("\na type the user set is never argued with");

await check("refuses to reclassify over a hand-set type", async () => {
  reset("book");
  const textbook = item({ type: "textbook", type_source: "user" });
  textbook.resources = [resource("cover.png"), resource("dune.epub")];
  const after = outcome(await moveResource(textbook, 1, 0));

  assert.deepEqual(asked, []);
  assert.equal(after.type, "textbook");
  assert.equal(after.type_source, "user");
  assert.equal(after.resources[0]?.name, "dune.epub", "the reorder itself still happens");
});

console.log("\nno opinion is not the same as no type");

await check("keeps an existing type when the classifier has nothing to say", async () => {
  reset(null);
  const film = item({ type: "movie", type_source: "auto" });
  film.resources = [resource("dune.mp4"), resource("notes.txt")];
  const after = outcome(await moveResource(film, 1, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/notes.txt"]);
  assert.equal(after.type, "movie");
  assert.equal(after.type_source, "auto");
});

await check("leaves an untyped item untyped when nothing matches", async () => {
  reset(null);
  const after = outcome(await attachResource(item(), resource("notes.txt")));

  assert.equal(after.type, null);
  assert.equal(after.type_source, null);
});

console.log("\none gesture, one undo");

await check("carries the new type in the same pair as the new order", async () => {
  reset("book");
  const film = item({ type: "movie", type_source: "auto" });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const change = await moveResource(film, 1, 0);

  // Two pairs would mean two undos, and a user who pressed undo once
  // would be left holding the old order with the new type.
  assert.equal(change.pairs.length, 1);
  assert.equal((change.pairs[0]?.before as Item).type, "movie");
  assert.equal(outcome(change).type, "book");
});

await check("says in the description that the type moved too", async () => {
  reset("book");
  const film = item({ type: "movie", type_source: "auto" });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const change = await moveResource(film, 1, 0);

  assert.match(change.description, /reclassified as book$/);
});

await check("stays quiet when the guess is the type it already had", async () => {
  reset("book");
  const book = item({ type: "book", type_source: "auto" });
  book.resources = [resource("a.epub"), resource("b.epub")];
  const change = await moveResource(book, 1, 0);

  assert.doesNotMatch(change.description, /reclassified/);
});

console.log(`\n${passed} assertions passed\n`);
