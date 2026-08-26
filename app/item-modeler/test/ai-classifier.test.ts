// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the item classifier — a smaller sibling of
// modeling.test.ts's suite, same house style (no framework, an inline
// `check()` runner, a programmable `ModelClient` stub).
//
// No weights are needed to run this: the model is reached through the
// same `client` port `modelItem`'s tests use, so what's proven here is
// that the machinery — the enum-membership check, the degrade-never-throw
// posture, the timeout — is correct, not that a real model picks well.
import assert from "node:assert/strict";
import { classifyItemType } from "../src/index.js";
import type { ModelClient } from "../src/collector/language-model/local-model-client.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

interface Stub {
  answer: unknown;
  fail?: string;
  hang?: boolean;
  calls: number;
}

function stubModel(answer: unknown = null, options: { fail?: string; hang?: boolean } = {}): Stub {
  return { answer, calls: 0, ...options };
}

function clientFor(stub: Stub): ModelClient {
  return {
    async extract() {
      stub.calls += 1;
      if (stub.hang) return new Promise(() => {});
      if (stub.fail) throw new Error(stub.fail);
      return { type: stub.answer } as Record<string, unknown>;
    },
    describe: () => ({ name: "stub", quantization: "none" }),
    dispose: async () => {},
  };
}

const TYPES = [{ name: "book" }, { name: "receipt" }];

async function run(): Promise<void> {
  console.log("\na valid answer");

  await check("a type the model names is returned", async () => {
    const stub = stubModel("book");
    const result = await classifyItemType({
      description: "a paperback novel I just finished",
      types: TYPES,
      client: clientFor(stub),
    });
    assert.equal(result.type, "book");
    assert.equal(result.warnings.length, 0);
  });

  await check("null is returned as-is, with no warning", async () => {
    const stub = stubModel(null);
    const result = await classifyItemType({
      description: "something I can't place",
      types: TYPES,
      client: clientFor(stub),
    });
    assert.equal(result.type, null);
    assert.equal(result.warnings.length, 0);
  });

  console.log("\nnot trusting the raw answer");

  await check("a name outside the offered list is treated as no answer", async () => {
    const stub = stubModel("spaceship");
    const result = await classifyItemType({
      description: "a description",
      types: TYPES,
      client: clientFor(stub),
    });
    assert.equal(result.type, null);
    assert.ok(result.warnings.some((warning) => warning.code === "value-rejected"));
  });

  await check("a throwing client degrades to null, never rejects the caller", async () => {
    const stub = stubModel(null, { fail: "the model process died" });
    const result = await classifyItemType({
      description: "a description",
      types: TYPES,
      client: clientFor(stub),
    });
    assert.equal(result.type, null);
    assert.ok(result.warnings.some((warning) => warning.code === "reader-failed"));
  });

  console.log("\nshort-circuits — the model is never touched");

  await check("an empty type list is answered without calling the model", async () => {
    const stub = stubModel("book");
    const result = await classifyItemType({ description: "a description", types: [], client: clientFor(stub) });
    assert.equal(result.type, null);
    assert.equal(stub.calls, 0);
  });

  await check("a blank description is answered without calling the model", async () => {
    const stub = stubModel("book");
    const result = await classifyItemType({ description: "   ", types: TYPES, client: clientFor(stub) });
    assert.equal(result.type, null);
    assert.equal(stub.calls, 0);
  });

  console.log("\nno model to ask");

  await check("no client and no installed model degrades to null, never throws", async () => {
    const result = await classifyItemType({
      description: "a description",
      types: TYPES,
      modelPath: "/nowhere/does-not-exist.gguf",
    });
    assert.equal(result.type, null);
    assert.ok(result.warnings.some((warning) => warning.code === "reader-failed"));
  });

  await check("no client and no modelPath at all degrades to null, never throws", async () => {
    const result = await classifyItemType({ description: "a description", types: TYPES });
    assert.equal(result.type, null);
    assert.ok(result.warnings.some((warning) => warning.code === "reader-failed"));
  });

  console.log("\na model that never answers");

  await check("a hung client degrades on timeout rather than hanging the caller", async () => {
    const stub = stubModel(null, { hang: true });
    const started = Date.now();
    const result = await classifyItemType({
      description: "a description",
      types: TYPES,
      client: clientFor(stub),
      timeoutMs: 50,
    });
    const elapsed = Date.now() - started;
    assert.equal(result.type, null);
    assert.ok(result.warnings.some((warning) => warning.code === "reader-failed"));
    assert.ok(elapsed < 1000, `expected the timeout to bound the wait, took ${elapsed}ms`);
  });

  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
