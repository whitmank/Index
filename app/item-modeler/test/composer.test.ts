// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the composer as its own entry point — that it
// accepts claims from any source, not just extractor's own output, and
// still enforces everything that makes a write trustworthy: grounding, a
// field nothing spoke to being reported rather than invented, and a
// user's value never being overwritten. `modeling.test.ts` already
// exhaustively covers this machinery through `modelItem`; this file only
// proves the split entry point works standing alone, fed hand-built
// claims with no extractor involved at all.
import assert from "node:assert/strict";
import { ulid } from "@index/database";
import type { Data, Item, Schema, SchemaAttribute } from "@index/database/types";
import { composeSchema, type ComposeRequest } from "../src/composer/index.js";
import type { FieldClaim } from "../src/contracts/field-claim.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const field = (attribute: string): SchemaAttribute => ({ attribute, kind: "string", display: true });
const BOOK: Schema = {
  id: "schemas:book",
  name: "book",
  attributes: [field("title"), field("author"), field("publisher")],
};

function emptyItem(name = "dune.epub"): Item {
  const data: Data = { name: { attribute: "name", value: name, kind: "string", prov: "user" } };
  return {
    id: `items:${ulid()}`,
    date_added: "2026-08-13T00:00:00Z",
    layout: "default",
    set: false,
    data,
    resources: [{ uri: `mbp:///${name}`, name }],
    deleted_at: null,
  };
}

const claim = (field: string, value: string, origin: FieldClaim["provenance"]["origin"] = "deterministic"): FieldClaim => ({
  field,
  value,
  provenance: { origin, sourceIds: ["s0:x"], method: origin === "language-model" ? "language-model" : "epub-opf", at: "2026-08-16T00:00:00Z" },
});

function baseRequest(overrides: Partial<ComposeRequest> = {}): ComposeRequest {
  return {
    claims: [],
    evidenceText: "",
    schema: BOOK,
    existing: emptyItem(),
    overwriteModeledValues: true,
    conflictPolicy: "record",
    userFields: [],
    derivedName: null,
    includeProvenance: true,
    ...overrides,
  };
}

async function run(): Promise<void> {
  console.log("\nclaims from anywhere, not just extractor's own output");

  await check("hand-built claims populate an empty item", async () => {
    const result = await composeSchema(
      baseRequest({
        claims: [claim("title", "Dune"), claim("author", "Frank Herbert")],
        derivedName: "dune.epub",
      }),
    );
    // `title` is BOOK's leading attribute — the naming field, per
    // `apply-modeling-result.ts`'s `isNamingField` — so it becomes the
    // item's name rather than a `data.title` row.
    assert.equal(result.item.data.name.value, "Dune");
    assert.equal(result.item.data.author?.value, "Frank Herbert");
    // The name changes from the derived filename to "Dune" — a rewrite of
    // an existing (non-blank) value, so `normalized`, not `populated`.
    assert.equal(result.changes.find((change) => change.target === "name")?.action, "normalized");
    assert.equal(result.changes.find((change) => change.field === "author")?.action, "populated");
  });

  console.log("\nownership: a user's value is never overwritten");

  await check("a user-entered field disagreeing with a claim is conflicted, not replaced", async () => {
    const existing = emptyItem();
    existing.data.author = { attribute: "author", value: "Someone Else", kind: "string", prov: "user" };
    const result = await composeSchema(baseRequest({ claims: [claim("author", "Frank Herbert")], existing }));

    assert.equal(result.item.data.author?.value, "Someone Else");
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.changes.find((change) => change.field === "author")?.action, "conflicted");
  });

  console.log("\ngrounding: a synthesised claim must be found in the evidence");

  await check("an ungrounded language-model claim is rejected, not written", async () => {
    const result = await composeSchema(
      baseRequest({
        claims: [claim("publisher", "A Publisher Invented From Nowhere", "language-model")],
        evidenceText: "Dune by Frank Herbert, a science fiction novel",
      }),
    );
    assert.equal(result.item.data.publisher, undefined);
    assert.equal(result.rejected, 1);
    assert.ok(result.warnings.some((warning) => warning.code === "value-rejected"));
  });

  await check("the same claim, actually in the evidence, is grounded and written", async () => {
    const result = await composeSchema(
      baseRequest({
        claims: [claim("publisher", "Ace Books", "language-model")],
        evidenceText: "Dune by Frank Herbert, published by Ace Books",
      }),
    );
    assert.equal(result.item.data.publisher?.value, "Ace Books");
    assert.equal(result.rejected, 0);
  });

  console.log("\na field nothing spoke to");

  await check("reports field-unsupported rather than leaving silence", async () => {
    const result = await composeSchema(baseRequest({ claims: [claim("publisher", "Ace Books")] }));
    assert.ok(
      result.warnings.some((warning) => warning.code === "field-unsupported" && warning.field === "title"),
    );
    assert.ok(
      result.warnings.some((warning) => warning.code === "field-unsupported" && warning.field === "author"),
    );
  });

  console.log("\nincludeProvenance");

  await check("false strips provenance without changing what was written", async () => {
    const result = await composeSchema(
      baseRequest({ claims: [claim("author", "Frank Herbert")], includeProvenance: false }),
    );
    assert.equal(result.item.data.author?.value, "Frank Herbert");
    assert.equal(result.changes[0]?.provenance, undefined);
  });

  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
