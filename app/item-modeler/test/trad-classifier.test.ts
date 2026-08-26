// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the trad stage's ladder: book via a resource's
// own declared media type, an album/article via a known host, an article
// via a page's own schema.org markup, a pdf via its structural reader —
// and, throughout, that a rule with nothing to go on says nothing rather
// than guessing. Same house style as ai-classifier.test.ts and
// pdf-reader.test.ts: no framework, an inline `check()` runner.
//
// The exhaustive pdf type-ladder (doi/isbn/length) is pdf-reader.test.ts's
// job — this file only proves classifyTrad actually reaches that rung.
import assert from "node:assert/strict";
import http from "node:http";
import type { Resource } from "@index/database/types";
import { classifyTrad, type ClassificationSource } from "../src/classifier/trad/trad-classifier.js";
import { PDF_MIME } from "../src/classifier/trad/pdf-reader.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const resource = (uri: string, mime?: string): Resource => ({
  uri,
  name: "x",
  ...(mime ? { cached: { mime } } : {}),
});

const byUrl = (uri: string) => classifyTrad(resource(uri), null);

/** A minimal pdf: `%PDF-` header, an Info dictionary, a trailer — just
 * enough for `readPdf` to name it a document by default, or a book once
 * its declared page count crosses the reader's threshold. */
function pdfBytes(pages = 3): Buffer {
  const body =
    "%PDF-1.7\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    `2 0 obj\n<< /Type /Pages /Count ${pages} /Kids [] >>\nendobj\n` +
    "3 0 obj\n<< /Title (Dune) >>\nendobj\n" +
    "trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n0\n%%EOF\n";
  return Buffer.from(body, "latin1");
}

function pdfSource(bytes: Buffer): ClassificationSource {
  return {
    kind: "file",
    size: bytes.length,
    head: bytes,
    tail: async () => bytes,
    mime: async () => PDF_MIME,
    text: async () => "",
  };
}

async function run(): Promise<void> {
  console.log("\nbook: a resource's own declared media type");

  await check("an epub's declared mime is a book, regardless of extension", async () => {
    assert.equal(
      await classifyTrad(resource("mbp:///dune.zip", "application/epub+zip"), null),
      "book",
    );
  });

  await check("a plain zip wearing .epub is not a book", async () => {
    assert.equal(await classifyTrad(resource("mbp:///liar.epub", "application/zip"), null), null);
  });

  console.log("\nhosts, not the web at large");

  await check("types a spotify album url", async () => {
    assert.equal(await byUrl("https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv"), "album");
  });

  await check("types a wikipedia article", async () => {
    assert.equal(await byUrl("https://en.wikipedia.org/wiki/Your_Name"), "article");
  });

  await check("types a non-english wikipedia the same way", async () => {
    assert.equal(await byUrl("https://ja.wikipedia.org/wiki/君の名は。"), "article");
  });

  await check("leaves wikipedia's own non-article paths alone", async () => {
    assert.equal(await byUrl("https://en.wikipedia.org/"), null);
  });

  await check("says nothing about the rest of the web on the url alone", async () => {
    for (const url of [
      "https://github.com/anthropics/anthropic-sdk-python",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://example.com/some/essay",
    ]) {
      assert.equal(await byUrl(url), null, url);
    }
  });

  console.log("\npdf: reaches the structural reader");

  await check("a pdf's declared mime routes to the pdf reader", async () => {
    const type = await classifyTrad(resource("mbp:///paper.pdf", PDF_MIME), pdfSource(pdfBytes()));
    assert.equal(type, "document");
  });

  await check("a long pdf reaches the reader's book rung", async () => {
    const type = await classifyTrad(resource("mbp:///long.pdf", PDF_MIME), pdfSource(pdfBytes(412)));
    assert.equal(type, "book");
  });

  console.log("\nwhat a page declares about itself");

  const hits: Record<string, number> = {};
  const server = http.createServer((request, response) => {
    const url = request.url ?? "/";
    hits[url] = (hits[url] ?? 0) + 1;
    if (url === "/article") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        `<!doctype html><html><head><script type="application/ld+json">{"@type":"NewsArticle"}</script></head></html>`,
      );
    } else if (url === "/repo") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        `<!doctype html><html><head><script type="application/ld+json">{"@type":"SoftwareSourceCode"}</script></head></html>`,
      );
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  const webSourceFor = async (pathname: string): Promise<ClassificationSource> => {
    const body = await (await fetch(`${origin}${pathname}`)).text();
    return {
      kind: "web",
      size: body.length,
      head: Buffer.from(body),
      tail: async () => Buffer.alloc(0),
      mime: async () => null,
      text: async () => body,
    };
  };

  await check("types a page that calls itself an article", async () => {
    const type = await classifyTrad(resource(`${origin}/article`), await webSourceFor("/article"));
    assert.equal(type, "article");
  });

  await check("says nothing about a page that calls itself something else", async () => {
    const type = await classifyTrad(resource(`${origin}/repo`), await webSourceFor("/repo"));
    assert.equal(type, null);
  });

  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));

  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
