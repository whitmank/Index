// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for backend-gateway.ts — the seam item-modeler's
// evidence collection reads sources through. Thin on purpose: the actual
// resolution/fetch logic is resolver.ts's and previews/fetch.ts's own,
// already tested elsewhere; this only proves the port is wired to them
// correctly.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { backendGateway } from "../src/services/ingest/backend-gateway.js";
import { pathToUri } from "../src/services/intake.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "index-backend-gateway-"));

async function run(): Promise<void> {
  console.log("\nlocalPath");

  await check("resolves an existing local file to its absolute path", async () => {
    const filepath = path.join(workspace, "dune.txt");
    fs.writeFileSync(filepath, "Dune");
    assert.equal(backendGateway.localPath(pathToUri(filepath)), filepath);
  });

  await check("answers null for a file that is not there", async () => {
    assert.equal(backendGateway.localPath(pathToUri(path.join(workspace, "absent.txt"))), null);
  });

  await check("answers null for a web url — that is fetch's job", async () => {
    assert.equal(backendGateway.localPath("https://example.com/page"), null);
  });

  console.log("\nfetch");

  const server = http.createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Dune by Frank Herbert");
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  await check("fetches a reachable url's body, capped", async () => {
    const body = await backendGateway.fetch(`${origin}/ok`, 1024);
    assert.equal(body?.toString(), "Dune by Frank Herbert");
  });

  await check("caps the read rather than buffering the whole body", async () => {
    const body = await backendGateway.fetch(`${origin}/ok`, 4);
    assert.equal(body?.length, 4);
  });

  await check("answers null for a 404", async () => {
    assert.equal(await backendGateway.fetch(`${origin}/nowhere`, 1024), null);
  });

  await check("answers null for a local path — that is localPath's job", async () => {
    const filepath = path.join(workspace, "not-a-url.txt");
    fs.writeFileSync(filepath, "x");
    assert.equal(await backendGateway.fetch(pathToUri(filepath), 1024), null);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
