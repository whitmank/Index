// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for the ingest pipeline: that a probe identifies
// a file by what its bytes declare rather than what its name claims, and
// that intake reaches the real extractor/composer pipeline
// (`@index/item-modeler`, via `services/intake.js`'s `extractEntries`)
// end to end. Deep extraction-correctness coverage — the collectors, the
// grounding, the schema join — is item-modeler's own suite now
// (modeling.test.ts and friends); what stays here is specific to this
// package: probe mechanics, and the wiring from a dropped file to a real
// registered schema through a real (throwaway) database.
//
// Fixtures are built here rather than committed: an epub is a zip with a
// prescribed first entry, which is exactly the structure under test, and
// a checked-in binary would hide it.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { formatOfResource, startDatabase, upsertSchema } from "@index/database";
import { openProbe } from "../src/services/ingest/probe.js";
import { sha256File } from "../src/services/hash.js";
import { extractEntries, pathsToResources, pathToUri } from "../src/services/intake.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "index-ingest-"));
const store = fs.mkdtempSync(path.join(os.tmpdir(), "index-ingest-db-"));
const TEST_PORT = 8499;

const handle = await startDatabase({ directory: store, port: TEST_PORT });
await upsertSchema({
  name: "book",
  attributes: [
    { attribute: "title", kind: "string", display: true },
    { attribute: "author", kind: "string", display: true },
    { attribute: "published", kind: "date", display: true },
    { attribute: "genre", kind: "list", display: true },
    { attribute: "isbn", kind: "string", display: true },
  ],
});
await upsertSchema({
  name: "document",
  attributes: [
    { attribute: "title", kind: "string", display: true },
    { attribute: "isbn", kind: "string", display: true },
  ],
});

/** Dublin Core repeats an element rather than delimiting it, so the
 * number of `dc:subject`s a fixture declares is what decides whether the
 * extractor reports a string or a list. */
const opfFor = (subjects: string[]) => `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>Frank Herbert</dc:creator>
    <dc:date>1965-08-01T00:00:00Z</dc:date>
${subjects.map((subject) => `    <dc:subject>${subject}</dc:subject>`).join("\n")}
    <dc:identifier>urn:uuid:not-an-isbn</dc:identifier>
    <dc:identifier>ISBN 978-0-441-01359-3</dc:identifier>
  </metadata>
</package>`;

const OPF = opfFor(["Science Fiction", "Politics"]);

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

/** The OCF layout: `mimetype` first and stored uncompressed, so its media
 * type sits at a fixed offset in the file's opening bytes. */
async function writeEpub(
  filename: string,
  mimetype = "application/epub+zip",
  options: { subjects?: string[] } = {},
): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", mimetype, { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", options.subjects ? opfFor(options.subjects) : OPF);
  const filepath = path.join(workspace, filename);
  await fs.promises.writeFile(filepath, await zip.generateAsync({ type: "nodebuffer" }));
  return filepath;
}

function write(filename: string, bytes: Buffer): string {
  const filepath = path.join(workspace, filename);
  fs.writeFileSync(filepath, bytes);
  return filepath;
}

function writePdf(filename: string): string {
  const body =
    "%PDF-1.7\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Count 3 /Kids [] >>\nendobj\n" +
    "3 0 obj\n<< /Title (Dune) /Author (Frank Herbert) >>\nendobj\n" +
    "trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n0\n%%EOF\n";
  return write(filename, Buffer.from(body, "latin1"));
}

/** Counts the two ways this codebase reads a file end to end — buffered
 * (`readFile`) and streamed (`createReadStream`, what the hasher uses) —
 * so "how many times was this file read" is a number a test can assert
 * on. `readHead` opens an fd directly and is deliberately not counted:
 * it reads 64 KB, not the file. */
function countFullReads() {
  const realReadFile = fs.promises.readFile;
  const realCreateReadStream = fs.createReadStream;
  const counter = {
    buffered: 0,
    streamed: 0,
    total: () => counter.buffered + counter.streamed,
    stop: () => {
      fs.promises.readFile = realReadFile;
      fs.createReadStream = realCreateReadStream;
    },
  };

  // @ts-expect-error — restored by stop()
  fs.promises.readFile = (...args: Parameters<typeof realReadFile>) => {
    counter.buffered += 1;
    return realReadFile(...args);
  };
  fs.createReadStream = (...args: Parameters<typeof realCreateReadStream>) => {
    counter.streamed += 1;
    return realCreateReadStream(...args);
  };

  return counter;
}

const probeOf = async (filepath: string) => await openProbe(pathToUri(filepath));

console.log("\nprobe: what the bytes declare");

await check("reads an epub's declared media type out of the zip's first entry", async () => {
  const probe = await probeOf(await writeEpub("dune.epub"));
  assert.equal(await probe?.mime(), "application/epub+zip");
});

await check("identifies an epub that has been given the wrong extension", async () => {
  const probe = await probeOf(await writeEpub("dune.zip"));
  assert.equal(await probe?.mime(), "application/epub+zip");
});

await check("turns away a plain zip wearing an .epub extension", async () => {
  const zip = new JSZip();
  zip.file("notes.txt", "not a book");
  const filepath = write("impostor.epub", await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(await (await probeOf(filepath))?.mime(), "application/zip");
});

await check("recognizes a png by signature", async () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64),
  ]);
  assert.equal(await (await probeOf(write("shot.png", png)))?.mime(), "image/png");
});

await check("recognizes a pdf by its header", async () => {
  assert.equal(await (await probeOf(writePdf("paper.pdf")))?.mime(), "application/pdf");
});

await check("has no opinion about bytes it does not know", async () => {
  const probe = await probeOf(write("notes.md", Buffer.from("# just prose\n")));
  assert.equal(await probe?.mime(), null);
});

await check("returns no probe for a web uri", async () => {
  assert.equal(await openProbe("https://example.com/page"), null);
});

await check("returns no probe for a path that is not there", async () => {
  assert.equal(await openProbe(pathToUri(path.join(workspace, "absent.epub"))), null);
});

console.log("\nprobe: what it costs");

await check("reads a bounded head, not the whole file", async () => {
  const big = write("big.bin", Buffer.alloc(300_000, 0x41));
  const probe = await probeOf(big);
  assert.equal(probe?.size, 300_000);
  assert.equal(probe?.head.length, 64 * 1024);
});

await check("reads a short file's head whole", async () => {
  const probe = await probeOf(write("tiny.bin", Buffer.from("hello")));
  assert.equal(probe?.head.length, 5);
});

await check("reads a bounded tail, and the end of the file is what is in it", async () => {
  const bytes = Buffer.concat([Buffer.alloc(300_000, 0x41), Buffer.from("%%EOF")]);
  const tail = await (await probeOf(write("ended.bin", bytes)))?.tail();

  assert.equal(tail?.length, 256 * 1024);
  assert.equal(tail?.subarray(-5).toString(), "%%EOF");
});

await check("hands back the whole of a file shorter than the tail", async () => {
  const probe = await probeOf(write("brief.bin", Buffer.from("all of it")));
  assert.equal((await probe?.tail())?.toString(), "all of it");
});

await check("slices the tail out of memory when the file is already loaded", async () => {
  const probe = await probeOf(write("both.bin", Buffer.alloc(1024, 3)));
  await probe?.bytes();

  const reads = countFullReads();
  const tail = await probe?.tail();
  reads.stop();

  assert.equal(reads.total(), 0);
  assert.equal(tail?.length, 1024);
});

await check("hashes the same bytes the streaming hasher does", async () => {
  const filepath = write("hashed.bin", Buffer.from("some content"));
  assert.equal(await (await probeOf(filepath))?.hash(), await sha256File(filepath));
});

await check("buffers the file once however many times it is asked", async () => {
  const probe = await probeOf(await writeEpub("counted.epub"));
  const reads = countFullReads();
  try {
    await probe?.bytes();
    await probe?.bytes();
    await probe?.bytes();
  } finally {
    reads.stop();
  }
  assert.equal(reads.total(), 1);
});

await check("signs bytes already in memory rather than reading them again", async () => {
  const filepath = await writeEpub("signed.epub");
  const probe = await probeOf(filepath);
  await probe?.bytes();

  const reads = countFullReads();
  const hash = await probe?.hash();
  reads.stop();

  assert.equal(reads.total(), 0);
  assert.equal(hash, await sha256File(filepath));
});

await check("streams the signature when nobody needed the whole file", async () => {
  const probe = await probeOf(write("unopened.bin", Buffer.alloc(2048, 7)));
  const reads = countFullReads();
  await probe?.hash();
  reads.stop();

  assert.equal(reads.buffered, 0);
  assert.equal(reads.streamed, 1);
});

console.log("\nintake: classification and identity, end to end");

await check("classifies a dropped epub and signs it, start to finish", async () => {
  const filepath = await writeEpub("once.epub");
  const [result] = await pathsToResources([filepath]);

  assert.equal(result?.type, "book");
  assert.equal(result?.resource.contentHash, await sha256File(filepath));
  assert.equal(result?.resource.name, "once.epub");
});

await check("fills a registered schema's fields from the epub's own metadata", async () => {
  const [result] = await pathsToResources([await writeEpub("filled.epub")]);

  assert.equal(result?.type, "book");
  assert.equal(result?.name, "Dune");
  assert.equal(result?.entries.find((entry) => entry.attribute === "author")?.value, "Frank Herbert");
});

await check("classifies a mis-named epub by its bytes, end to end", async () => {
  const [result] = await pathsToResources([await writeEpub("hidden.zip")]);

  assert.equal(result?.resource.cached?.mime, "application/epub+zip");
  assert.equal(result?.type, "book");
});

await check("refuses a plain zip wearing .epub, end to end", async () => {
  const zip = new JSZip();
  zip.file("readme.txt", "not a book");
  const filepath = write("liar.epub", await zip.generateAsync({ type: "nodebuffer" }));
  const [result] = await pathsToResources([filepath]);

  // The extension says book and the bytes say otherwise. Before the
  // sniffed mime outranked the name, the name won and this was a book.
  assert.equal(result?.resource.cached?.mime, "application/zip");
  assert.equal(formatOfResource(result?.resource), "file");
  // Not asserting `type` here: the trad ladder alone says null for this
  // (item-modeler's own trad-classifier.test.ts pins that), but this
  // machine's real classification settings/model — read live from
  // `~/.index`, same as the running app — may let the ai stage take a
  // guess from the filename alone once trad has nothing. That's a fact
  // about this machine's config, not something this integration test
  // should pin down.
});

console.log("\nintake: a dropped pdf");

await check("classifies and signs a dropped pdf without extraction failing it", async () => {
  const filepath = writePdf("dropped.pdf");
  const [result] = await pathsToResources([filepath]);

  assert.equal(result?.type, "document");
  assert.equal(result?.resource.cached?.mime, "application/pdf");
  assert.equal(result?.resource.contentHash, await sha256File(filepath));
  // A pdf's fields are synthesised, not transcribed (item-modeler's
  // DESIGN.md: deterministic pdf title/author reading was measured
  // unreliable and moved to the model) — so with no extraction model
  // installed in this test environment, nothing is filled. Never wrong,
  // just quieter than an epub with its own package document.
  assert.deepEqual(result?.entries, []);
});

console.log("\nthe web probe: one fetch, shared");

// Classification's own ladder (host rules, schema.org markup) is
// item-modeler's own regression suite now (trad-classifier.test.ts). What
// stays here is the guarantee specific to this package: intake reads a
// page's bytes exactly once and both classification and preview metadata
// see that same read.
const ldPage = (types: string) => `<!doctype html><html><head>
  <title>A Piece of Writing</title>
  <meta property="og:type" content="website">
  <meta property="og:description" content="the extract">
  <script type="application/ld+json">${types}</script>
</head><body><article>words</article></body></html>`;

const hits: Record<string, number> = {};
const server = http.createServer((request, response) => {
  const url = request.url ?? "/";
  hits[url] = (hits[url] ?? 0) + 1;
  if (url === "/article") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(ldPage('{"@type":"NewsArticle"}'));
  } else if (url === "/photo.bin") {
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.end(Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]));
  } else {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const origin = `http://127.0.0.1:${port}`;

await check("fetches the page once for metadata and classification together", async () => {
  for (const key of Object.keys(hits)) delete hits[key];
  const [result] = await pathsToResources([`${origin}/article`]);

  // Before the probe: once in the scrape, and again for anything else
  // that wanted to look. The favicon is a separate url and may fetch too.
  assert.equal(hits["/article"], 1);
  assert.equal(result?.type, "article");
  assert.equal(result?.resource.cached?.card_title, "A Piece of Writing");
  assert.equal(result?.resource.cached?.card_extract, "the extract");
});

await check("leaves a page unhashed — bytes are a file's identity, not a url's", async () => {
  const [result] = await pathsToResources([`${origin}/article`]);
  assert.equal(result?.resource.contentHash, undefined);
});

await check("sniffs a mislabelled image url past its Content-Type", async () => {
  const [result] = await pathsToResources([`${origin}/photo.bin`]);
  assert.equal(result?.resource.cached?.mime, "image/png");
  assert.equal(formatOfResource(result?.resource), "image");
});

await new Promise<void>((resolve) => server.close(() => resolve()));

console.log("\nextractEntries: intake's and Parse's shared extraction call");

await check("no type: nothing to extract for", async () => {
  const filepath = await writeEpub("no-type.epub");
  const result = await extractEntries(null, undefined, { uri: pathToUri(filepath), name: "no-type.epub" });
  assert.deepEqual(result, { entries: [] });
});

await check("a type with no registered schema: nothing to extract for", async () => {
  const filepath = await writeEpub("no-schema.epub");
  const result = await extractEntries("textbook", undefined, {
    uri: pathToUri(filepath),
    name: "no-schema.epub",
  });
  assert.deepEqual(result, { entries: [] });
});

await check("a registered schema with a real epub: name and fields come back", async () => {
  const schemas = { name: "book", attributes: [{ attribute: "title", kind: "string" as const, display: true }] };
  const filepath = await writeEpub("direct.epub");
  const result = await extractEntries("book", { id: "schemas:book", ...schemas }, {
    uri: pathToUri(filepath),
    name: "direct.epub",
  });
  assert.equal(result.name, "Dune");
});

fs.rmSync(workspace, { recursive: true, force: true });
await handle.stop();

console.log(`\n${passed} assertions passed\n`);
