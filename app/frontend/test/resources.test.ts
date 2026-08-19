// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for lib/resources.ts — the rule about when an
// item's type may be guessed again. It is worth pinning because every
// clause of it is a decision that reads as arbitrary from the code alone:
// which resource counts as the subject, which guesses are allowed to
// overwrite what, and which are refused.
import assert from "node:assert/strict";
import type { Data, DataEntry, Item, Provenance, Resource, Schema, SchemaAttribute } from "@index/database/types";

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

const { attachResource, detachResource, dropIndexFor, moveResource } = await import(
  "../src/lib/resources.js"
);
const { changes } = await import("../src/changes/index.js");
const { resolveLayout } = await import("../src/layouts/registry.tsx");
const { knownFieldsFor } = await import("../src/lib/derive.js");

function resource(name: string): Resource {
  return { uri: `mbp:///Users/k/${name}`, name };
}

function itemType(value: string, prov: Provenance): DataEntry {
  return { attribute: "type", value, kind: "string", prov };
}

function item(overrides: { name?: string; type?: DataEntry | null; resources?: Resource[] } = {}): Item {
  const data: Data = { name: { attribute: "name", value: overrides.name ?? "Dune", kind: "string", prov: "user" } };
  if (overrides.type) data.type = overrides.type;
  return {
    id: "items:01TEST",
    date_added: "2026-08-12T00:00:00.000Z",
    layout: "default",
    set: false,
    data,
    resources: overrides.resources ?? [],
    deleted_at: null,
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
  assert.equal(after.data.type?.value, "book");
  assert.equal(after.data.type?.prov, "auto");
});

await check("never classifies a resource appended behind the primary", async () => {
  reset("book");
  const film = item({ type: itemType("movie", "auto"), resources: [resource("dune.mp4")] });
  const after = outcome(await attachResource(film, resource("dune.epub")));

  // The IMDb-page case: a supplementary source says nothing about what
  // the item fundamentally is, so it is never asked about.
  assert.deepEqual(asked, []);
  assert.equal(after.data.type?.value, "movie");
  assert.equal(after.resources.length, 2);
});

await check("classifies again when a different resource is promoted to primary", async () => {
  reset("movie");
  const page = item({ type: itemType("link", "auto") });
  page.resources = [resource("dune-imdb.html"), resource("dune.mp4")];
  const after = outcome(await moveResource(page, 1, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/dune.mp4"]);
  assert.equal(after.data.type?.value, "movie");
  assert.equal(after.data.type?.prov, "auto");
  assert.equal(after.resources[0]?.name, "dune.mp4");
});

await check("does not classify a reorder that leaves the primary alone", async () => {
  reset("movie");
  const film = item({ type: itemType("movie", "auto") });
  film.resources = [resource("dune.mp4"), resource("a.html"), resource("b.html")];
  await moveResource(film, 2, 1);

  assert.deepEqual(asked, []);
});

await check("classifies whatever a removed primary was standing in front of", async () => {
  reset("book");
  const film = item({ type: itemType("movie", "auto") });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const after = outcome(await detachResource(film, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/dune.epub"]);
  assert.equal(after.data.type?.value, "book");
});

console.log("\na type the user set is never argued with");

await check("refuses to reclassify over a hand-set type", async () => {
  reset("book");
  const textbook = item({ type: itemType("textbook", "user") });
  textbook.resources = [resource("cover.png"), resource("dune.epub")];
  const after = outcome(await moveResource(textbook, 1, 0));

  assert.deepEqual(asked, []);
  assert.equal(after.data.type?.value, "textbook");
  assert.equal(after.data.type?.prov, "user");
  assert.equal(after.resources[0]?.name, "dune.epub", "the reorder itself still happens");
});

console.log("\nno opinion is not the same as no type");

await check("keeps an existing type when the classifier has nothing to say", async () => {
  reset(null);
  const film = item({ type: itemType("movie", "auto") });
  film.resources = [resource("dune.mp4"), resource("notes.txt")];
  const after = outcome(await moveResource(film, 1, 0));

  assert.deepEqual(asked, ["mbp:///Users/k/notes.txt"]);
  assert.equal(after.data.type?.value, "movie");
  assert.equal(after.data.type?.prov, "auto");
});

await check("leaves an untyped item untyped when nothing matches", async () => {
  reset(null);
  const after = outcome(await attachResource(item(), resource("notes.txt")));

  assert.equal(after.data.type, undefined);
});

console.log("\none gesture, one undo");

await check("carries the new type in the same pair as the new order", async () => {
  reset("book");
  const film = item({ type: itemType("movie", "auto") });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const change = await moveResource(film, 1, 0);

  // Two pairs would mean two undos, and a user who pressed undo once
  // would be left holding the old order with the new type.
  assert.equal(change.pairs.length, 1);
  assert.equal((change.pairs[0]?.before as Item).data.type?.value, "movie");
  assert.equal(outcome(change).data.type?.value, "book");
});

await check("says in the description that the type moved too", async () => {
  reset("book");
  const film = item({ type: itemType("movie", "auto") });
  film.resources = [resource("dune.mp4"), resource("dune.epub")];
  const change = await moveResource(film, 1, 0);

  assert.match(change.description, /reclassified as book$/);
});

await check("stays quiet when the guess is the type it already had", async () => {
  reset("book");
  const book = item({ type: itemType("book", "auto") });
  book.resources = [resource("a.epub"), resource("b.epub")];
  const change = await moveResource(book, 1, 0);

  assert.doesNotMatch(change.description, /reclassified/);
});

console.log("\nwhat a type puts at the top of an item");

const bookSchema = (attributes: SchemaAttribute[]): Schema => ({
  id: "schemas:book",
  name: "book",
  attributes,
});
const declare = (attribute: string, hidden = false): SchemaAttribute => ({
  attribute,
  kind: "string",
  display: !hidden,
});

const laidOut = (attributes: SchemaAttribute[]) =>
  resolveLayout(item({ type: itemType("book", "auto") }), [bookSchema(attributes)]).entry.fields?.map(
    (f) => f.attribute,
  );

await check("draws every field but the one that names the item", () => {
  assert.deepEqual(laidOut([declare("title"), declare("author"), declare("isbn")]), [
    "author",
    "isbn",
  ]);
});

await check("leaves out the ones marked hidden", () => {
  // Not gone: FieldsEditor draws whatever this block doesn't claim, so a
  // hidden field's value moves down the panel rather than off it.
  assert.deepEqual(laidOut([declare("title"), declare("author"), declare("isbn", true)]), [
    "author",
  ]);
});

await check("finds its type's schema whatever case either was written in", () => {
  const capitalised: Schema = {
    id: "schemas:song",
    name: "Song",
    attributes: [declare("title"), declare("artist")],
  };

  // The Spotify import writes `type: "song"`; a schema created by typing
  // "Song" into the type manager keeps the capital. An exact match found
  // neither, so every imported song lost its fields.
  const drawn = resolveLayout(item({ type: itemType("song", "auto") }), [capitalised]).entry.fields;
  assert.deepEqual(drawn?.map((field) => field.attribute), ["artist"]);
});

await check("falls back to the default layout when nothing is left to lay out", () => {
  const resolution = resolveLayout(
    item({ type: itemType("book", "auto") }),
    [bookSchema([declare("title"), declare("isbn", true)])],
  );

  // A type whose only visible field is its name has nothing for the
  // two-column shape to hold, so it resolves as an untyped item would.
  assert.equal(resolution.entry.fields, undefined);
  assert.equal(resolution.source, "default");
});

console.log("\nknownFieldsFor — not currently drawn by Focus.tsx (stripped to title/description/resources), but exported for when a richer editor comes back");

await check("draws every field but the one that names the item", () => {
  const fields = knownFieldsFor("book", [bookSchema([declare("title"), declare("author"), declare("isbn")])]);
  assert.deepEqual(fields.map((f) => f.attribute), ["author", "isbn"]);
});

await check("leaves out the ones marked hidden", () => {
  const fields = knownFieldsFor("book", [
    bookSchema([declare("title"), declare("author"), declare("isbn", true)]),
  ]);
  assert.deepEqual(fields.map((f) => f.attribute), ["author"]);
});

await check("finds its type's schema whatever case either was written in", () => {
  const capitalised: Schema = {
    id: "schemas:song",
    name: "Song",
    attributes: [declare("title"), declare("artist")],
  };
  const fields = knownFieldsFor("song", [capitalised]);
  assert.deepEqual(fields.map((f) => f.attribute), ["artist"]);
});

await check("returns nothing when there is nothing left to lay out", () => {
  const fields = knownFieldsFor("book", [bookSchema([declare("title"), declare("isbn", true)])]);
  assert.deepEqual(fields, []);
});

await check("returns nothing for an untyped item", () => {
  assert.deepEqual(knownFieldsFor(null, [bookSchema([declare("title"), declare("author")])]), []);
});

console.log("\nwhere a dragged row lands");

await check("dropping above an earlier row lands on that row's index", () => {
  // [a b c d], c dragged onto b's slot → index 1.
  assert.equal(dropIndexFor(2, 1), 1);
  assert.equal(dropIndexFor(3, 0), 0);
});

await check("dropping below discounts the gap the row leaves behind", () => {
  // [a b c d], a dragged past c: the pointer is over index 3, but once a
  // is lifted out everything above it shifts down one, so it lands at 2.
  assert.equal(dropIndexFor(0, 3), 2);
  assert.equal(dropIndexFor(1, 3), 2);
});

await check("dropping onto its own slot resolves to where it already is", () => {
  // Both edges of the row it came from: the caller compares against
  // `from` and does nothing, so a drag that goes nowhere writes no change
  // and costs no undo entry.
  assert.equal(dropIndexFor(2, 2), 2);
  assert.equal(dropIndexFor(2, 3), 2);
});

await check("dragging the last row to the very top makes it primary", () => {
  assert.equal(dropIndexFor(3, 0), 0);
});

console.log("\nconfirming a guess locks it");

await check("confirming keeps the type and takes ownership of it", async () => {
  const guessed = item({ type: itemType("book", "auto") });
  const after = outcome(changes.confirmType(guessed));

  assert.equal(after.data.type?.value, "book", "confirming changes who decided, not what");
  assert.equal(after.data.type?.prov, "user");
});

await check("a confirmed guess then survives a new primary resource", async () => {
  reset("movie");
  const confirmed = outcome(changes.confirmType(item({ type: itemType("book", "auto") })));
  confirmed.resources = [resource("dune.epub"), resource("dune.mp4")];
  const after = outcome(await moveResource(confirmed, 1, 0));

  assert.deepEqual(asked, [], "a confirmed type is not even asked about");
  assert.equal(after.data.type?.value, "book");
});

await check("choosing a type by hand confirms it in the same gesture", async () => {
  reset("movie");
  // Nothing to agree with afterwards: picking from the menu already said
  // a person decided, which is the only thing confirming would add.
  const picked = outcome(changes.setType(item({ type: itemType("book", "auto") }), "textbook"));
  assert.equal(picked.data.type?.prov, "user");

  picked.resources = [resource("dune.epub"), resource("dune.mp4")];
  assert.deepEqual(asked, []);
  assert.equal(outcome(await moveResource(picked, 1, 0)).data.type?.value, "textbook");
});

await check("clearing is the way back to guessing", async () => {
  reset("movie");
  const cleared = outcome(changes.setType(item({ type: itemType("book", "user") }), null));
  assert.equal(cleared.data.type, undefined);

  cleared.resources = [resource("dune.epub"), resource("dune.mp4")];
  assert.equal(outcome(await moveResource(cleared, 1, 0)).data.type?.value, "movie");
});

await check("records no provenance for an item with no type", async () => {
  const after = outcome(changes.confirmType(item()));

  // A type and its source are present or absent together; nothing can be
  // confirmed about a classification that was never made.
  assert.equal(after.data.type, undefined);
});

await check("names what was agreed to in the description", async () => {
  const guessed = item({ type: itemType("book", "auto") });
  assert.match(changes.confirmType(guessed).description, /^Confirm 'Dune' is a book$/);
});

console.log(`\n${passed} assertions passed\n`);
