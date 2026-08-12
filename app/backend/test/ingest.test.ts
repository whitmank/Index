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
import http from "node:http";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { formatOfResource } from "@index/database";
import type { Field, FieldKind, Schema, SchemaField } from "@index/database/types";
import { classifyResource, classifyUri } from "../src/services/ingest/classify.js";
import { extract, toFields } from "../src/services/ingest/extract.js";
import { openProbe } from "../src/services/ingest/probe.js";
import { declaresArticle } from "../src/services/ingest/signals/schemaOrg.js";
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
  assert.equal(result?.resource.name, "once.epub");
});



await check("classifies a mis-named epub by its bytes, end to end", async () => {
  const [result] = await pathsToResources([await writeEpub("hidden.zip")]);

  assert.equal(result?.resource.cached?.mime, "application/epub+zip");
  assert.equal(result?.type, "book");
  assert.equal(result?.fields.find((f) => f.name === "title")?.value, "Dune");
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
  assert.equal(result?.fields.find((f) => f.name === "title")?.value, "Dune");
});

console.log("\nclassification: hosts, not the web at large");

// The host rules answer from the url alone, so they are asked with no
// probe — which also keeps them off the network. What a page's *content*
// decides is exercised further down, against a local server.
const byUrl = (uri: string) => classifyResource({ uri, name: "x" }, null);

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

console.log("\nwhat a page declares about itself");

const ldPage = (types: string) => `<!doctype html><html><head>
  <title>A Piece of Writing</title>
  <meta property="og:type" content="website">
  <meta property="og:description" content="the extract">
  <script type="application/ld+json">${types}</script>
</head><body><article>words</article></body></html>`;

await check("reads a plain @type", () => {
  assert.equal(declaresArticle(ldPage('{"@type":"Article"}')), true);
});

await check("reads one out of an array of blocks", () => {
  assert.equal(
    declaresArticle(ldPage('[{"@type":"WebSite"},{"@type":"NewsArticle"}]')),
    true,
  );
});

await check("reads one out of an @graph", () => {
  assert.equal(
    declaresArticle(ldPage('{"@graph":[{"@type":"Organization"},{"@type":"BlogPosting"}]}')),
    true,
  );
});

await check("is not fooled by a news site's front page", () => {
  // The shape that defeats every inference: a homepage full of <article>
  // elements, published by a news organisation, declaring itself a
  // WebPage — which is exactly what it is.
  assert.equal(
    declaresArticle(ldPage('[{"@type":"WebPage"},{"@type":"NewsMediaOrganization"}]')),
    false,
  );
});

await check("has no opinion when the page declares nothing", () => {
  assert.equal(declaresArticle("<html><body><article>words</article></body></html>"), false);
});

await check("survives a malformed block without losing the others", () => {
  const html = `<html><head>
    <script type="application/ld+json">{ not json at all </script>
    <script type="application/ld+json">{"@type":"BlogPosting"}</script>
  </head></html>`;
  assert.equal(declaresArticle(html), true);
});

console.log("\nthe web probe: one fetch, shared");

const hits: Record<string, number> = {};
const server = http.createServer((request, response) => {
  const url = request.url ?? "/";
  hits[url] = (hits[url] ?? 0) + 1;
  if (url === "/article") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(ldPage('{"@type":"NewsArticle"}'));
  } else if (url === "/repo") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(ldPage('{"@type":"SoftwareSourceCode"}'));
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

await check("types a page that calls itself an article", async () => {
  assert.equal(await classifyUri(`${origin}/article`, "article"), "article");
});

await check("says nothing about a page that calls itself something else", async () => {
  assert.equal(await classifyUri(`${origin}/repo`, "repo"), null);
});

await check("says nothing when the page cannot be reached", async () => {
  assert.equal(await classifyUri(`${origin}/nowhere`, "gone"), null);
});

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

console.log("\nextraction: the field names the schema join must not break");

await check("reports every element it read, naming nothing on its own", async () => {
  const probe = await probeOf(await writeEpub("fields.epub"));
  const { name, fields } = await extract("book", probe);

  // A reader has no opinion about which of its findings is the item's
  // name — the type says so, and this one was asked without a schema.
  assert.equal(name, undefined);
  assert.deepEqual(fields, [
    { name: "title", value: "Dune", kind: "string" },
    { name: "author", value: "Frank Herbert", kind: "string" },
    { name: "published", value: "1965-08-01", kind: "date" },
    { name: "genre", value: ["Science Fiction", "Politics"], kind: "list" },
    { name: "isbn", value: "9780441013593", kind: "string" },
  ]);
});

await check("reports a lone value as itself, not a list of one", async () => {
  const probe = await probeOf(
    await writeEpub("single.epub", "application/epub+zip", { subjects: ["Cyberpunk"] }),
  );
  const genre = (await extract("book", probe)).fields.find((f) => f.name === "genre");
  assert.deepEqual(genre, { name: "genre", value: "Cyberpunk", kind: "string" });
});

await check("has nothing to say about a type with no extractor", async () => {
  const probe = await probeOf(await writeEpub("untyped.epub"));
  assert.deepEqual(await extract("movie", probe), { fields: [] });
  assert.deepEqual(await extract(null, probe), { fields: [] });
});

await check("survives a file that is not the book it was typed as", async () => {
  const probe = await probeOf(write("lying.epub", Buffer.from("not a zip at all")));
  assert.deepEqual(await extract("book", probe), { fields: [] });
});

console.log("\nthe schema join: the file's words, the type's names");

const schema = (fields: SchemaField[]): Schema => ({
  id: "schemas:book",
  name: "book",
  label: null,
  fields,
});
const field = (name: string, kind: FieldKind = "string", label: string | null = null) =>
  ({ name, kind, label });

const said = (key: string, value: Field["value"] = "x", kind: FieldKind = "string") =>
  ({ key, value, kind });

const namesOf = (fields: Field[]) => fields.map((f) => f.name);

await check("passes keys through verbatim when the type declares no fields", () => {
  const observations = [said("title", "Dune"), said("author", "Frank Herbert")];
  assert.deepEqual(toFields(observations), {
    fields: [
      { name: "title", value: "Dune", kind: "string" },
      { name: "author", value: "Frank Herbert", kind: "string" },
    ],
  });
  assert.deepEqual(toFields(observations, schema([])), toFields(observations));
});

await check("lands an observation in the field the schema calls it", () => {
  const joined = toFields(
    [said("title", "Dune"), said("author", "Frank Herbert")],
    schema([field("title"), field("writer")]),
  );

  // The case the whole join exists for: one row, named as the type
  // declares, instead of an empty `writer` beside an orphan `author`.
  assert.deepEqual(joined.fields, [{ name: "writer", value: "Frank Herbert", kind: "string" }]);
});

await check("ignores case, spaces, underscores and hyphens in a name", () => {
  for (const declared of ["Published", "PUBLISHED_DATE", "release-date", "Release Date"]) {
    // A leading field the observations never match, so the one under test
    // is a row rather than the item's name.
    const joined = toFields(
      [said("published", "1965")],
      schema([field("unmatched"), field(declared, "date")]),
    );
    assert.deepEqual(namesOf(joined.fields), [declared], declared);
  }
});

await check("matches a field by its display label too", () => {
  const joined = toFields(
    [said("isbn", "9780441013593")],
    schema([field("unmatched"), field("code", "string", "ISBN")]),
  );
  assert.deepEqual(namesOf(joined.fields), ["code"]);
});

await check("prefers an exact name over another field's synonym", () => {
  // `writer` is declared first and would match by synonym, but `author`
  // is what the observation is actually called, so it wins regardless of
  // declaration order.
  const joined = toFields(
    [said("author", "Frank Herbert")],
    schema([field("writer"), field("author")]),
  );
  assert.deepEqual(joined.fields, [{ name: "author", value: "Frank Herbert", kind: "string" }]);
});

await check("never hands one observation to two fields", () => {
  const joined = toFields(
    [said("author", "Frank Herbert")],
    schema([field("unmatched"), field("author"), field("creator")]),
  );
  assert.deepEqual(namesOf(joined.fields), ["author"]);
});

await check("takes the kind the schema declares, and reshapes the value", () => {
  const toList = toFields(
    [said("genre", "Science Fiction")],
    schema([field("unmatched"), field("genre", "list")]),
  );
  assert.deepEqual(toList.fields, [{ name: "genre", value: ["Science Fiction"], kind: "list" }]);

  const toText = toFields(
    [said("genre", ["Science Fiction", "Politics"], "list")],
    schema([field("unmatched"), field("genre", "string")]),
  );
  assert.deepEqual(toText.fields, [
    { name: "genre", value: "Science Fiction, Politics", kind: "string" },
  ]);
});

await check("keeps what the file said that the type has no word for", () => {
  const joined = toFields(
    [said("title", "Dune"), said("isbn", "9780441013593")],
    schema([field("title")]),
  );

  // Dropping it would lose something the file really declared; a row the
  // user can delete is the honest fallback.
  assert.deepEqual(namesOf(joined.fields), ["isbn"]);
  assert.equal(joined.name, "Dune");
});

await check("does not write empty rows for fields nothing matched", () => {
  const joined = toFields(
    [said("title", "Dune"), said("isbn", "978")],
    schema([field("title"), field("isbn"), field("pages", "number")]),
  );

  // The layout already draws a type's declared fields from the schema,
  // so emitting blanks here would put them on the item twice.
  assert.deepEqual(namesOf(joined.fields), ["isbn"]);
});

await check("orders matched rows the way the type declares them", () => {
  const joined = toFields(
    [said("isbn", "978"), said("title", "Dune"), said("author", "Frank Herbert")],
    schema([field("title"), field("writer"), field("isbn")]),
  );
  assert.deepEqual(namesOf(joined.fields), ["writer", "isbn"]);
});

await check("joins a real epub's metadata onto a schema that renames it", async () => {
  const probe = await probeOf(await writeEpub("joined.epub"));
  const { name, fields } = await extract(
    "book",
    probe,
    schema([field("title"), field("writer"), field("year", "date"), field("categories", "list")]),
  );

  // Every rung at once: the leading field taken as the name, a synonym
  // (`writer`), a synonym that also narrows the kind (`year`), a synonym
  // keeping the list (`categories`), and an observation the schema has no
  // word for.
  assert.equal(name, "Dune");
  assert.deepEqual(fields, [
    { name: "writer", value: "Frank Herbert", kind: "string" },
    { name: "year", value: "1965-08-01", kind: "date" },
    { name: "categories", value: ["Science Fiction", "Politics"], kind: "list" },
    { name: "isbn", value: "9780441013593", kind: "string" },
  ]);
});

console.log("\nthe first field is the item's name");

await check("takes the first field's value as the name, and writes no row for it", () => {
  const joined = toFields(
    [said("title", "Flatland"), said("author", "Edwin Abbott Abbott")],
    schema([field("title"), field("author")]),
  );

  assert.equal(joined.name, "Flatland");
  assert.deepEqual(namesOf(joined.fields), ["author"]);
});

await check("claims the name through a synonym, same as any other match", () => {
  const joined = toFields([said("title", "Flatland")], schema([field("heading", "string", "Title")]));
  assert.equal(joined.name, "Flatland");
  assert.deepEqual(joined.fields, []);
});

await check("says nothing when the first field matched nothing", () => {
  const joined = toFields(
    [said("author", "Edwin Abbott Abbott")],
    schema([field("title"), field("author")]),
  );

  // The type wants its name from the title and the file never gave one,
  // so whatever intake derived from the path stands.
  assert.equal(joined.name, undefined);
  assert.deepEqual(namesOf(joined.fields), ["author"]);
});

await check("reordering the type moves the name with it", () => {
  const observations = [said("title", "Flatland"), said("author", "Edwin Abbott Abbott")];
  const byAuthor = toFields(observations, schema([field("author"), field("title")]));

  // Nothing about the word `title` is special — position is, which is the
  // point: a `person` type's `title` means Dr., not a name. Dragging a
  // field to the top is the same gesture as promoting a resource.
  assert.equal(byAuthor.name, "Edwin Abbott Abbott");
  assert.deepEqual(namesOf(byAuthor.fields), ["title"]);
});

await check("flattens a list into the one line a name has to be", () => {
  const joined = toFields(
    [said("author", ["Gilbert", "Sullivan"], "list")],
    schema([field("author", "list")]),
  );
  assert.equal(joined.name, "Gilbert, Sullivan");
});

await check("a type whose only field is its name draws no rows at all", () => {
  const joined = toFields([said("title", "Flatland")], schema([field("title")]));
  assert.equal(joined.name, "Flatland");
  assert.deepEqual(joined.fields, []);
});

await check("names an item from a real epub, end to end", async () => {
  const probe = await probeOf(await writeEpub("named.epub"));
  const { name, fields } = await extract("book", probe, schema([field("title"), field("author")]));

  assert.equal(name, "Dune");
  assert.equal(fields.find((f) => f.name === "title"), undefined);
  assert.deepEqual(fields.find((f) => f.name === "author")?.value, "Frank Herbert");
});

await check("joins the same epub onto a schema that wants one line instead", async () => {
  const probe = await probeOf(await writeEpub("flattened.epub"));
  const { fields } = await extract(
    "book",
    probe,
    schema([field("title"), field("genre", "string")]),
  );

  // The other direction, and the reason the extractor reports the shape
  // it found: a type declaring `string` still gets the joined line it
  // used to get, without the extractor knowing that type exists.
  assert.deepEqual(fields.find((f) => f.name === "genre"), {
    name: "genre",
    value: "Science Fiction, Politics",
    kind: "string",
  });
});

fs.rmSync(workspace, { recursive: true, force: true });

console.log(`\n${passed} assertions passed\n`);
