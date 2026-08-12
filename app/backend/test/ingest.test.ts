// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for the ingest pipeline's two contracts: that a
// probe identifies a file by what its bytes declare rather than what its
// name claims, and that the book extractor still emits the same five
// field names it did before observations and fields were separate
// things — the baseline the schema join has to not break later.
//
// Fixtures are built here rather than committed: an epub is a zip with a
// prescribed first entry, which is exactly the structure under test, and
// a checked-in binary would hide it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { formatOfResource } from "@index/database";
import { classifyUri } from "../src/services/ingest/classify.js";
import { extract } from "../src/services/ingest/extract.js";
import { openProbe } from "../src/services/ingest/probe.js";
import { sha256File } from "../src/services/hash.js";
import { pathsToResources, pathToUri } from "../src/services/intake.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "index-ingest-"));

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>Frank Herbert</dc:creator>
    <dc:date>1965-08-01T00:00:00Z</dc:date>
    <dc:subject>Science Fiction</dc:subject>
    <dc:subject>Politics</dc:subject>
    <dc:identifier>urn:uuid:not-an-isbn</dc:identifier>
    <dc:identifier>ISBN 978-0-441-01359-3</dc:identifier>
  </metadata>
</package>`;

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

/** The OCF layout: `mimetype` first and stored uncompressed, so its media
 * type sits at a fixed offset in the file's opening bytes. */
async function writeEpub(filename: string, mimetype = "application/epub+zip"): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", mimetype, { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", OPF);
  const filepath = path.join(workspace, filename);
  await fs.promises.writeFile(filepath, await zip.generateAsync({ type: "nodebuffer" }));
  return filepath;
}

function write(filename: string, bytes: Buffer): string {
  const filepath = path.join(workspace, filename);
  fs.writeFileSync(filepath, bytes);
  return filepath;
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

console.log("\nintake: one read per file on the way in");

await check("reads a dropped epub exactly once, start to finish", async () => {
  const filepath = await writeEpub("once.epub");
  const reads = countFullReads();
  const [result] = await pathsToResources([filepath]);
  reads.stop();

  // Before the probe: streamed once for the hash, buffered again for the
  // zip. The whole point of the module is that this is now 1.
  assert.equal(reads.total(), 1);
  assert.equal(result?.type, "book");
  assert.equal(result?.resource.contentHash, await sha256File(filepath));
  assert.equal(result?.fields.length, 5);
});

await check("classifies a mis-named epub by its bytes, end to end", async () => {
  const [result] = await pathsToResources([await writeEpub("hidden.zip")]);

  assert.equal(result?.resource.cached?.mime, "application/epub+zip");
  assert.equal(result?.type, "book");
  assert.equal(result?.fields.find((field) => field.name === "title")?.value, "Dune");
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
  assert.equal(result?.type, null);
});

await check("still trusts an epub whose mimetype entry is deflated", async () => {
  // Non-conformant — the OCF spec requires that entry be stored — but
  // real tools ship them, and demoting a genuine book over a packaging
  // mistake is the worse error.
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "DEFLATE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", OPF);
  const filepath = write("deflated.epub", await zip.generateAsync({ type: "nodebuffer" }));
  const [result] = await pathsToResources([filepath]);

  assert.equal(result?.type, "book");
  assert.equal(result?.fields.find((field) => field.name === "title")?.value, "Dune");
});

console.log("\nclassification: hosts, not the web at large");

await check("types a wikipedia article", async () => {
  assert.equal(await classifyUri("https://en.wikipedia.org/wiki/Your_Name", "Your Name"), "article");
});

await check("types a non-english wikipedia the same way", async () => {
  assert.equal(await classifyUri("https://ja.wikipedia.org/wiki/君の名は。", "x"), "article");
});

await check("leaves wikipedia's own non-article pages alone", async () => {
  assert.equal(await classifyUri("https://en.wikipedia.org/", "wikipedia"), null);
});

await check("says nothing about the rest of the web", async () => {
  for (const url of [
    "https://github.com/anthropics/anthropic-sdk-python",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/some/essay",
  ]) {
    assert.equal(await classifyUri(url, "x"), null, url);
  }
});

console.log("\nextraction: the field names the schema join must not break");

await check("emits the same five fields the ingestor did before the split", async () => {
  const probe = await probeOf(await writeEpub("fields.epub"));
  const fields = await extract("book", probe);

  assert.deepEqual(fields, [
    { name: "title", value: "Dune", kind: "string" },
    { name: "author", value: "Frank Herbert", kind: "string" },
    { name: "published", value: "1965-08-01", kind: "date" },
    { name: "genre", value: "Science Fiction, Politics", kind: "string" },
    { name: "isbn", value: "9780441013593", kind: "string" },
  ]);
});

await check("has nothing to say about a type with no extractor", async () => {
  const probe = await probeOf(await writeEpub("untyped.epub"));
  assert.deepEqual(await extract("movie", probe), []);
  assert.deepEqual(await extract(null, probe), []);
});

await check("survives a file that is not the book it was typed as", async () => {
  const probe = await probeOf(write("lying.epub", Buffer.from("not a zip at all")));
  assert.deepEqual(await extract("book", probe), []);
});

fs.rmSync(workspace, { recursive: true, force: true });

console.log(`\n${passed} assertions passed\n`);
