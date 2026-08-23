// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for staging: trad runs first and short-circuits
// ai when it finds a type, ai runs (with a description built from the
// resource) when trad has nothing, and each stage can be switched off
// independently. Same house style as the module's other tests: no
// framework, an inline `check()` runner, a programmable `ModelClient`
// stub (the same port ai-classifier.test.ts stubs).
import assert from "node:assert/strict";
import type { Resource } from "@index/database/types";
import { classifyResource } from "../src/classification/classify-resource.js";
import type { ClassificationSource } from "../src/classification/trad/trad-classifier.js";
import type { ModelClient } from "../src/extractor/language-model/local-model-client.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

interface Stub {
  answer: unknown;
  calls: number;
  lastUser?: string;
}

function stubModel(answer: unknown = null): Stub {
  return { answer, calls: 0 };
}

function clientFor(stub: Stub): ModelClient {
  return {
    async extract(request) {
      stub.calls += 1;
      stub.lastUser = request.user;
      return { type: stub.answer } as Record<string, unknown>;
    },
    describe: () => ({ name: "stub", quantization: "none" }),
    dispose: async () => {},
  };
}

const TYPES = [{ name: "book" }, { name: "essay" }];

const spotifyResource: Resource = { uri: "https://open.spotify.com/album/abc", name: "x" };
const plainFileResource: Resource = { uri: "mbp:///notes.bin", name: "notes.bin" };

function webSource(text: string): ClassificationSource {
  return {
    kind: "web",
    size: text.length,
    head: Buffer.from(text),
    tail: async () => Buffer.alloc(0),
    mime: async () => null,
    text: async () => text,
  };
}

async function run(): Promise<void> {
  console.log("\ntrad short-circuits ai");

  await check("a trad hit is returned without ever calling the model", async () => {
    const stub = stubModel("essay");
    const result = await classifyResource({
      resource: spotifyResource,
      source: null,
      types: TYPES,
      stages: { trad: true, ai: true },
      client: clientFor(stub),
    });
    assert.equal(result.type, "album");
    assert.equal(result.stage, "trad");
    assert.equal(stub.calls, 0);
  });

  console.log("\nai runs when trad has nothing");

  await check("a trad miss falls back to ai, tagged by stage", async () => {
    const stub = stubModel("essay");
    const result = await classifyResource({
      resource: plainFileResource,
      source: null,
      types: TYPES,
      stages: { trad: true, ai: true },
      client: clientFor(stub),
    });
    assert.equal(result.type, "essay");
    assert.equal(result.stage, "ai");
    assert.equal(stub.calls, 1);
  });

  await check("the ai description is the resource's name for a plain file", async () => {
    const stub = stubModel(null);
    await classifyResource({
      resource: plainFileResource,
      source: null,
      types: TYPES,
      stages: { trad: true, ai: true },
      client: clientFor(stub),
    });
    assert.ok(stub.lastUser?.includes("notes.bin"));
  });

  await check("the ai description includes a stripped snippet of a web page's text", async () => {
    const stub = stubModel(null);
    const source = webSource("<html><body>  A long   essay about  <b>gardens</b>.</body></html>");
    await classifyResource({
      resource: { uri: "https://example.com/essay", name: "essay" },
      source,
      types: TYPES,
      stages: { trad: true, ai: true },
      client: clientFor(stub),
    });
    assert.ok(stub.lastUser?.includes("A long essay about gardens"), stub.lastUser ?? "no prompt recorded");
  });

  console.log("\nstages switch off independently");

  await check("ai disabled: a trad miss ends in null, model never touched", async () => {
    const stub = stubModel("essay");
    const result = await classifyResource({
      resource: plainFileResource,
      source: null,
      types: TYPES,
      stages: { trad: true, ai: false },
      client: clientFor(stub),
    });
    assert.equal(result.type, null);
    assert.equal(result.stage, null);
    assert.equal(stub.calls, 0);
  });

  await check("trad disabled: goes straight to ai, even for a url trad would have caught", async () => {
    const stub = stubModel("essay");
    const result = await classifyResource({
      resource: spotifyResource,
      source: null,
      types: TYPES,
      stages: { trad: false, ai: true },
      client: clientFor(stub),
    });
    assert.equal(result.type, "essay");
    assert.equal(result.stage, "ai");
    assert.equal(stub.calls, 1);
  });

  await check("both disabled: null, nothing called", async () => {
    const stub = stubModel("essay");
    const result = await classifyResource({
      resource: spotifyResource,
      source: null,
      types: TYPES,
      stages: { trad: false, ai: false },
      client: clientFor(stub),
    });
    assert.equal(result.type, null);
    assert.equal(result.stage, null);
    assert.equal(stub.calls, 0);
  });

  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
