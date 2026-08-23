// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the extractor as its own entry point — that
// it runs from a bare resource list (no Item required, since intake
// extracts a resource before it is ever attached to one), that an empty
// read never pays for opening a model, that `languageModelMode: "never"`
// really means never, and that a stubbed model still fills what
// transcription left blank. `modeling.test.ts` already exhaustively
// covers the collectors/transcription/grounding machinery through
// `modelItem`; this file only proves the split entry point's own
// contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { Resource, Schema, SchemaAttribute } from "@index/database/types";
import { extractClaims } from "../src/extractor/index.js";
import { nodeGateway } from "../src/extractor/evidence/source-resolution.js";
import type { ModelClient } from "../src/extractor/language-model/local-model-client.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "item-modeler-extractor-"));

const field = (attribute: string): SchemaAttribute => ({ attribute, kind: "string", display: true });
const BOOK: Schema = {
  id: "schemas:book",
  name: "book",
  attributes: [field("title"), field("author"), field("publisher")],
};

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>Frank Herbert</dc:creator>
  </metadata>
</package>`;

async function writeEpub(filename: string): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", OPF);
  const filepath = path.join(workspace, filename);
  await fs.promises.writeFile(filepath, await zip.generateAsync({ type: "nodebuffer" }));
  return filepath;
}

const resourceFor = (filepath: string): Resource => ({ uri: filepath, name: path.basename(filepath) });

function baseRequest(resources: Resource[]) {
  return {
    resources,
    schema: BOOK,
    gateway: nodeGateway,
    allowNetworkAccess: false,
    maxSources: 8,
    maxSourceTextLength: 200_000,
    languageModelMode: "fallback-only" as const,
    timeoutMs: 5_000,
    now: () => new Date("2026-08-16T00:00:00Z"),
  };
}

function clientFor(answer: Record<string, string | null>, calls: { count: number }): ModelClient {
  return {
    async extract() {
      calls.count += 1;
      return answer as Record<string, unknown>;
    },
    describe: () => ({ name: "stub", quantization: "none" }),
    dispose: async () => {},
  };
}

async function run(): Promise<void> {
  console.log("\nno Item required");

  await check("extracts from a bare resource list — no Item, no schema.attributes[0] as a name", async () => {
    const filepath = await writeEpub("dune.epub");
    const result = await extractClaims(baseRequest([resourceFor(filepath)]));
    const title = result.claims.find((claim) => claim.field === "title");
    assert.equal(title?.value, "Dune");
  });

  console.log("\nan empty read never pays for opening a model");

  await check("no resources at all: no claims, no basket, model never asked", async () => {
    const calls = { count: 0 };
    const result = await extractClaims({
      ...baseRequest([]),
      model: clientFor({ publisher: "should never be seen" }, calls),
    });
    assert.deepEqual(result.claims, []);
    assert.equal(result.sources.read, 0);
    assert.equal(calls.count, 0);
  });

  await check("a resource that cannot be read: same as no resources", async () => {
    const calls = { count: 0 };
    const missing = resourceFor(path.join(workspace, "does-not-exist.epub"));
    const result = await extractClaims({ ...baseRequest([missing]), model: clientFor({}, calls) });
    assert.deepEqual(result.claims, []);
    assert.equal(calls.count, 0);
    assert.ok(result.warnings.some((warning) => warning.code === "source-unreadable"));
  });

  console.log("\nlanguageModelMode: never means never");

  await check("never touches the model even with fields left unsettled", async () => {
    const calls = { count: 0 };
    const filepath = await writeEpub("no-model.epub");
    const result = await extractClaims({
      ...baseRequest([resourceFor(filepath)]),
      languageModelMode: "never",
      model: clientFor({ publisher: "should never be seen" }, calls),
    });
    assert.equal(calls.count, 0);
    assert.equal(result.claims.some((claim) => claim.field === "publisher"), false);
  });

  console.log("\nthe model fills what transcription left blank");

  await check("a stubbed model's answer arrives as a claim with model provenance", async () => {
    const calls = { count: 0 };
    const filepath = await writeEpub("with-model.epub");
    const result = await extractClaims({
      ...baseRequest([resourceFor(filepath)]),
      model: clientFor({ publisher: "Ace Books" }, calls),
    });
    assert.equal(calls.count, 1);
    const publisher = result.claims.find((claim) => claim.field === "publisher");
    assert.equal(publisher?.value, "Ace Books");
    assert.equal(publisher?.provenance.origin, "language-model");
  });

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
