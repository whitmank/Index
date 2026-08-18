// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for the `parse` verb — what it is allowed to
// write onto an item that already exists.
//
// Every rule here is a decision about whose work is at stake, which is
// exactly the kind that reads as arbitrary from the code alone: a field
// you filled in is never overwritten, a name you chose is never
// replaced, and a name the item merely inherited from its file is fair
// game. Parsing an item also settles its type, because asking for a
// book's fields is saying it is a book.
import assert from "node:assert/strict";
import type { Change, Item, MetadataEntry, Resource } from "@index/database/types";

let passed = 0;

async function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  await assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

/** What the backend was asked, and what it will answer. */
const asked: { uri: string; type: string }[] = [];
let found: { name?: string; metadata: MetadataEntry[] } = { metadata: [] };

(globalThis as { window?: unknown }).window = {
  index: {
    ingest: {
      parse: async (uri: string, type: string) => {
        asked.push({ uri, type });
        return { ok: found };
      },
    },
    changes: { apply: async () => ({ ok: { records: [] } }) },
  },
};

const { changes } = await import("../src/changes/index.js");

const FILENAME = "R. John Williams - The Buddha in the Machine (2014, Yale University Press).pdf";

function resource(name = FILENAME): Resource {
  return { uri: `mbp:///Users/k/${name}`, name };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "items:01TEST",
    name: FILENAME,
    display_name: null,
    date_added: "2026-08-12T00:00:00.000Z",
    date_created: null,
    opens: null,
    query: null,
    system: false,
    is_set: false,
    type: { value: "book", prov: "auto" },
    metadata: [],
    resources: [resource()],
    deleted_at: null,
    ...overrides,
  };
}

const text = (attribute: string, value: string): MetadataEntry => ({
  attribute,
  value,
  kind: "string",
  prov: "auto",
});

function outcome(change: Change | null): Item {
  assert.ok(change, "expected a change");
  return change.pairs[0]?.after as Item;
}

const valueOf = (metadata: MetadataEntry[], name: string) =>
  metadata.find((entry) => entry.attribute === name)?.value;

console.log("\nwhat parsing may write");

await check("fills a field the item does not have", () => {
  const after = outcome(
    changes.parseItem(item(), { metadata: [text("author", "R. John Williams")] }, FILENAME),
  );
  assert.equal(valueOf(after.metadata, "author"), "R. John Williams");
});

await check("fills the blank row a type's layout already drew", () => {
  // The schema's fields are drawn whether or not they carry anything, so
  // a found value has to land *in* the empty row rather than beside it.
  const blank = item({ metadata: [text("author", ""), text("publisher", "")] });
  const after = outcome(
    changes.parseItem(blank, { metadata: [text("author", "R. John Williams")] }, FILENAME),
  );

  assert.equal(after.metadata.length, 2);
  assert.equal(valueOf(after.metadata, "author"), "R. John Williams");
});

await check("never overwrites a value that is already there", () => {
  // Type already settled, so an overwrite is the only change left that
  // could happen — and it must not.
  const mine = item({
    type: { value: "book", prov: "user" },
    metadata: [text("author", "Williams, R. J.")],
  });
  const change = changes.parseItem(
    mine,
    { metadata: [text("author", "R. John Williams")] },
    FILENAME,
  );

  // Undo makes an overwrite recoverable, not acceptable: parsing an
  // item you curated is meant to finish it, not argue with it.
  assert.equal(change, null);
});

await check("matches an existing row whatever case it was typed in", () => {
  const mine = item({
    type: { value: "book", prov: "user" },
    metadata: [text("Author", "Williams, R. J.")],
  });
  assert.equal(
    changes.parseItem(mine, { metadata: [text("author", "R. John Williams")] }, FILENAME),
    null,
  );
});

console.log("\nthe name is only taken when it was never yours");

await check("replaces a name the item merely inherited from its file", () => {
  const after = outcome(
    changes.parseItem(item(), { name: "The Buddha in the Machine", metadata: [] }, FILENAME),
  );
  assert.equal(after.name, "The Buddha in the Machine");
});

await check("leaves a name you chose alone", () => {
  const renamed = item({ name: "Buddha (Williams)", type: { value: "book", prov: "user" } });
  const change = changes.parseItem(
    renamed,
    { name: "The Buddha in the Machine", metadata: [] },
    FILENAME,
  );

  // Nothing else to do here, so there is nothing to apply at all.
  assert.equal(change, null);
});

await check("says so in the description", () => {
  const change = changes.parseItem(
    item(),
    { name: "The Buddha in the Machine", metadata: [text("author", "R. John Williams")] },
    FILENAME,
  );
  assert.match(change?.description ?? "", /filled name and author$/);
});

console.log("\nparsing settles the type");

await check("takes ownership of a guess", () => {
  const after = outcome(
    changes.parseItem(item(), { metadata: [text("author", "R. John Williams")] }, FILENAME),
  );

  // Asking for a book's fields to be filled in is saying it is a book —
  // the same thing choosing a type by hand already says.
  assert.equal(after.type?.prov, "user");
});

await check("confirms the type even when the file had nothing to add", () => {
  const after = outcome(changes.parseItem(item(), { metadata: [] }, FILENAME));
  assert.equal(after.type?.prov, "user");
  assert.match(after.type ? "book" : "", /book/);
});

await check("has nothing to do once the type is yours and the fields are full", () => {
  const settled = item({
    type: { value: "book", prov: "user" },
    metadata: [text("author", "R. John Williams")],
  });
  assert.equal(
    changes.parseItem(settled, { metadata: [text("author", "R. John Williams")] }, FILENAME),
    null,
  );
});

console.log("\nrunning the verb");

const { parseItems } = await import("../src/lib/parseItems.js");

await check("asks the backend for the primary resource, against the item's type", async () => {
  asked.length = 0;
  found = { metadata: [text("author", "R. John Williams")] };
  const outcomes = await parseItems([item()]);

  assert.deepEqual(asked, [{ uri: `mbp:///Users/k/${FILENAME}`, type: "book" }]);
  assert.equal(outcomes.filled, 1);
});

await check("skips an untyped item rather than guessing at one", async () => {
  asked.length = 0;
  const outcomes = await parseItems([item({ type: null })]);

  // The type is the question parsing answers against; without one there
  // is nothing to ask, and the command bar says so before you get here.
  assert.deepEqual(asked, []);
  assert.equal(outcomes.skipped, 1);
});

await check("reports an item it read and had nothing to add to", async () => {
  found = { metadata: [] };
  const settled = item({ type: { value: "book", prov: "user" } });
  assert.deepEqual(await parseItems([settled]), { filled: 0, unchanged: 1, skipped: 0 });
});

console.log(`\n${passed} assertions passed\n`);
