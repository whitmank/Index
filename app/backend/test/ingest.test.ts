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
import zlib from "node:zlib";
import JSZip from "jszip";
import { formatOfResource } from "@index/database";
import type { AttributeKind, DataEntry, Schema, SchemaAttribute } from "@index/database/types";
import { classifyResource, classifyUri } from "../src/services/ingest/classify.js";
import { extract, toEntries } from "../src/services/ingest/extract.js";
import { openProbe } from "../src/services/ingest/probe.js";
import { fromFilename } from "../src/services/ingest/signals/filename.js";
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

// ---------------------------------------------------------------------
// pdf fixtures
//
// Built here for the same reason the epubs are: what the reader has to
// cope with *is* the structure — an index at the end of the file, the
// same fact spelled two different ways, a dictionary hidden inside a
// deflated stream — and a checked-in binary would hide every bit of it.
// ---------------------------------------------------------------------

/** A pdf literal string, escaped the way the syntax requires. */
const literal = (text: string) => `(${text.replace(/([\\()])/g, "\\$1")})`;

/** A pdf hex string, which is how a title carries anything utf-16. */
const utf16 = (text: string) =>
  `<FEFF${Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase()}>`;

const dict = (entries: Record<string, string>) =>
  `<< ${Object.entries(entries)
    .map(([key, value]) => `/${key} ${value}`)
    .join(" ")} >>`;

const object = (number: number, body: string) => `${number} 0 obj\n${body}\nendobj\n`;

const streamObject = (number: number, entries: Record<string, string>, data: Buffer) =>
  `${number} 0 obj\n${dict({ ...entries, Length: String(data.length) })}\n` +
  `stream\n${data.toString("latin1")}\nendstream\nendobj\n`;

const INFO: Record<string, string> = {
  Title: literal("Dune"),
  Author: literal("Frank Herbert"),
  Subject: literal("A boy, a desert, a spice"),
  Keywords: literal("Science Fiction, Politics"),
  CreationDate: literal("D:19650801120000-05'00'"),
  Producer: literal("Index Test Suite"),
};

/** The packet a producer writes, with room for whichever properties a
 * case is about. Namespaces are declared as real files declare them, so
 * the prefix-insensitivity the reader relies on is actually exercised. */
const xmpWith = (body: string, attributes = "") => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" ${attributes}
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
${body}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

interface PdfOptions {
  /** Null writes a file with no Info dictionary at all. */
  info?: Record<string, string> | null;
  pages?: number;
  xmp?: string;
  /** Hide the Info dictionary inside a deflated object stream — what a
   * pdf 1.5 producer does, and what defeats reading the file as text. */
  packed?: boolean;
  /** Bytes of padding between the header and everything else, to push
   * the objects and the trailer past anything a head could reach. */
  filler?: number;
}

function writePdf(filename: string, options: PdfOptions = {}): string {
  const info = options.info === undefined ? INFO : options.info;
  const parts = ["%PDF-1.7\n"];

  if (options.filler) parts.push(`%${"f".repeat(options.filler)}\n`);

  parts.push(
    object(1, dict({ Type: "/Catalog", Pages: "2 0 R", ...(options.xmp ? { Metadata: "4 0 R" } : {}) })),
    object(2, dict({ Type: "/Pages", Count: String(options.pages ?? 3), Kids: "[]" })),
  );

  if (info && !options.packed) parts.push(object(3, dict(info)));
  if (info && options.packed) {
    // An object stream is a header of `number offset` pairs followed by
    // the objects themselves, the whole thing deflated.
    const header = "3 0";
    const packed = Buffer.from(`${header}\n${dict(info)}`, "latin1");
    parts.push(
      streamObject(
        5,
        { Type: "/ObjStm", N: "1", First: String(header.length + 1), Filter: "/FlateDecode" },
        zlib.deflateSync(packed),
      ),
    );
  }
  if (options.xmp) {
    parts.push(streamObject(4, { Type: "/Metadata", Subtype: "/XML" }, Buffer.from(options.xmp, "utf8")));
  }

  parts.push(
    `trailer\n${dict({ Size: "6", Root: "1 0 R", ...(info ? { Info: "3 0 R" } : {}) })}\n`,
    "startxref\n0\n%%EOF\n",
  );
  return write(filename, Buffer.from(parts.join(""), "latin1"));
}

const schema = (attributes: SchemaAttribute[]): Schema => ({
  id: "schemas:book",
  name: "book",
  attributes,
});
const field = (attribute: string, kind: AttributeKind = "string"): SchemaAttribute =>
  ({ attribute, kind, display: true });

const metadataOf = async (filepath: string, type = "document") =>
  (await extract(type, await probeOf(filepath))).entries;

const valueOf = (entries: DataEntry[], name: string) =>
  entries.find((entry) => entry.attribute === name)?.value;

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
  assert.equal(result?.entries.length, 5);
  assert.equal(result?.resource.name, "once.epub");
});



await check("classifies a mis-named epub by its bytes, end to end", async () => {
  const [result] = await pathsToResources([await writeEpub("hidden.zip")]);

  assert.equal(result?.resource.cached?.mime, "application/epub+zip");
  assert.equal(result?.type, "book");
  assert.equal(result?.entries.find((f) => f.attribute === "title")?.value, "Dune");
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
  assert.equal(result?.entries.find((f) => f.attribute === "title")?.value, "Dune");
});

console.log("\npdf: reading a file that keeps its metadata at the end");

await check("reads the Info dictionary the trailer points at", async () => {
  const fields = await metadataOf(writePdf("info.pdf"));

  assert.deepEqual(fields, [
    { attribute: "title", value: "Dune", kind: "string", prov: "auto" },
    { attribute: "author", value: "Frank Herbert", kind: "string", prov: "auto" },
    { attribute: "published", value: "1965-08-01", kind: "date", prov: "auto" },
    { attribute: "genre", value: ["Science Fiction", "Politics"], kind: "list", prov: "auto" },
    { attribute: "pages", value: "3", kind: "number", prov: "auto" },
    // Info's `/Subject` is the document's *about*, not a category — a
    // preprint puts a whole abstract in it.
    { attribute: "description", value: "A boy, a desert, a spice", kind: "string", prov: "auto" },
  ]);
});

await check("decodes a title written in utf-16", async () => {
  const fields = await metadataOf(writePdf("wide.pdf", { info: { Title: utf16("Kafka on the Shore 海辺のカフカ") } }));
  assert.equal(valueOf(fields, "title"), "Kafka on the Shore 海辺のカフカ");
});

await check("splits several authors, and only where the file was unambiguous", async () => {
  const many = await metadataOf(writePdf("duo.pdf", { info: { Author: literal("Gilbert; Sullivan") } }));
  assert.deepEqual(valueOf(many, "author"), ["Gilbert", "Sullivan"]);

  // A comma is as likely to be a surname-first name as a separator, so
  // it is left alone — one author, said the way the file said it.
  const one = await metadataOf(writePdf("solo.pdf", { info: { Author: literal("Herbert, Frank") } }));
  assert.equal(valueOf(one, "author"), "Herbert, Frank");
});

await check("prefers what XMP says over the Info dictionary", async () => {
  const xmp = xmpWith(`   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Neuromancer</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>William Gibson</rdf:li></rdf:Seq></dc:creator>
   <dc:subject><rdf:Bag><rdf:li>Cyberpunk</rdf:li><rdf:li>Noir</rdf:li></rdf:Bag></dc:subject>`);
  const fields = await metadataOf(writePdf("xmp.pdf", { xmp }));

  // Both are present and they disagree: Info predates unicode and
  // producers keep it for compatibility, so the newer packet wins.
  assert.equal(valueOf(fields, "title"), "Neuromancer");
  assert.equal(valueOf(fields, "author"), "William Gibson");
  assert.deepEqual(valueOf(fields, "genre"), ["Cyberpunk", "Noir"]);
});

await check("does not mistake rdf's own scaffolding for a property", async () => {
  // `rdf:Description` is the element every property is wrapped in, one
  // local name away from `dc:description` — and reading it as one hands
  // back the whole packet's text. A real book came back described as its
  // own timestamps and toolchain.
  const xmp = xmpWith(`   <dc:title><rdf:Alt><rdf:li>Dune</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li>A boy on a desert world</rdf:li></rdf:Alt></dc:description>`);
  const fields = await metadataOf(writePdf("described.pdf", { info: null, xmp }));

  assert.equal(valueOf(fields, "title"), "Dune");
  assert.equal(valueOf(fields, "description"), "A boy on a desert world");
});

await check("reads XMP properties written as attributes", async () => {
  // The other spelling, and just as ordinary: a packet routinely uses
  // elements for the title and attributes for everything scalar.
  const xmp = xmpWith("", 'xmp:CreateDate="1984-07-01T00:00:00Z" dc:publisher="Ace Books"');
  const fields = await metadataOf(writePdf("attributes.pdf", { info: null, xmp }));

  assert.equal(valueOf(fields, "published"), "1984-07-01");
  assert.equal(valueOf(fields, "publisher"), "Ace Books");
});

await check("finds an Info dictionary packed into a compressed object stream", async () => {
  // A pdf 1.5 producer deflates its objects into one stream, which is
  // what defeats reading the file as text — the trailer's `/Info 3 0 R`
  // now points at something that is not in the file's plain bytes at all.
  const fields = await metadataOf(writePdf("packed.pdf", { packed: true }));
  assert.equal(valueOf(fields, "title"), "Dune");
  assert.equal(valueOf(fields, "author"), "Frank Herbert");
});

await check("reads the trailer of a file far too big to hold in a head", async () => {
  const filepath = writePdf("thick.pdf", { filler: 500_000 });
  assert.ok(fs.statSync(filepath).size > 500_000);

  // Everything worth reading sits past the 64 KB head and inside the
  // 256 KB tail, which is the arrangement of every real pdf.
  assert.equal(valueOf(await metadataOf(filepath), "title"), "Dune");
});

await check("reports the length of a pdf that declares nothing else", async () => {
  const fields = await metadataOf(writePdf("silent.pdf", { info: null, pages: 12 }));
  assert.deepEqual(fields, [{ attribute: "pages", value: "12", kind: "number", prov: "auto" }]);
});

await check("survives a file that claims to be a pdf and is not", async () => {
  const probe = await probeOf(write("torn.pdf", Buffer.from("%PDF-1.7\nand then nothing")));
  assert.equal(await probe?.mime(), "application/pdf");
  assert.deepEqual(await extract("document", probe), { entries: [] });
});

console.log("\npdf: which kind of document it is");

const typeOf = async (filepath: string) => await classifyUri(pathToUri(filepath), path.basename(filepath));

await check("types a pdf that declares a doi as an article", async () => {
  const xmp = xmpWith("   <prism:doi>10.1145/3373376.3378500</prism:doi>");
  assert.equal(await typeOf(writePdf("paper-doi.pdf", { xmp, pages: 400 })), "article");
});

await check("types a pdf that names the journal it appeared in as an article", async () => {
  const xmp = xmpWith("   <prism:publicationName>Nature</prism:publicationName>");
  assert.equal(await typeOf(writePdf("paper-journal.pdf", { xmp })), "article");
});

await check("types a pdf that declares an isbn as a book", async () => {
  const xmp = xmpWith("   <dc:identifier>ISBN 978-0-441-01359-3</dc:identifier>");
  assert.equal(await typeOf(writePdf("isbn.pdf", { xmp, pages: 4 })), "book");
});

await check("types a pdf long enough to be a book as one", async () => {
  // The one rung that is a guess rather than a reading, and the last:
  // nothing an article or a receipt plausibly reaches.
  assert.equal(await typeOf(writePdf("long.pdf", { pages: 412 })), "book");
});

await check("types every other pdf a document", async () => {
  assert.equal(await typeOf(writePdf("memo.pdf", { pages: 4 })), "document");
  assert.equal(await typeOf(writePdf("blank.pdf", { info: null })), "document");
});

await check("reads a dropped pdf without ever holding it in memory", async () => {
  const filepath = writePdf("dropped.pdf", { filler: 500_000 });
  const reads = countFullReads();
  const [result] = await pathsToResources([filepath]);
  reads.stop();

  // The whole point of the tail: a half-gigabyte scan is classified and
  // read for its metadata at the cost of two bounded reads, and the only
  // pass over the file is the streamed one that signs it.
  assert.equal(reads.buffered, 0);
  assert.equal(reads.streamed, 1);
  assert.equal(result?.type, "document");
  assert.equal(result?.entries.find((f) => f.attribute === "title")?.value, "Dune");
  assert.equal(result?.resource.cached?.mime, "application/pdf");
  assert.equal(result?.resource.contentHash, await sha256File(filepath));
});

console.log("\nthe name a file was saved under");

/** The parser reads a uri, so the fixtures are uris — and the ones that
 * must stay silent matter more than the ones that speak. */
const nameSays = (name: string) =>
  Object.fromEntries(fromFilename(`mbp:///Users/k/${name}`).map((o) => [o.key, o.value]));

await check("reads an archive's whole naming convention", () => {
  // The file this source exists for. It declares nothing internally, and
  // its only internal date is when someone re-wrapped the scan in 2019.
  assert.deepEqual(
    nameSays(
      " R. John Williams - The Buddha in the Machine_ Art, Technology, and the Meeting of " +
        "East and West (2014, Yale University Press) [10.12987_9780300206579] - libgen.li.pdf",
    ),
    {
      title: "The Buddha in the Machine: Art, Technology, and the Meeting of East and West",
      author: "R. John Williams",
      publisher: "Yale University Press",
      published: "2014-01-01",
      doi: "10.12987/9780300206579",
      isbn: "9780300206579",
    },
  );
});

await check("reads author and title from a year alone", () => {
  assert.deepEqual(nameSays("Frank Herbert - Dune (1965).epub"), {
    title: "Dune",
    author: "Frank Herbert",
    published: "1965-01-01",
  });
});

await check("takes the author from a calibre folder, where the name is ambiguous", () => {
  const inLibrary = fromFilename(
    "mbp:///Users/k/Calibre Library/Ted Chiang/Exhalation (417)/Exhalation - Ted Chiang.epub",
  );
  assert.deepEqual(
    Object.fromEntries(inLibrary.map((o) => [o.key, o.value])),
    { title: "Exhalation", author: "Ted Chiang" },
  );
});

await check("reads an identifier out of any name at all", () => {
  // No structure to speak of, but an isbn is an isbn and a doi is a doi.
  assert.deepEqual(nameSays("web-browser-engineering-9780198913870-0198913877_compress.pdf"), {
    isbn: "9780198913870",
  });
  assert.deepEqual(nameSays("10.48550_arxiv.2501.12948.pdf"), {
    doi: "10.48550/arxiv.2501.12948",
  });
});

await check("says nothing about a name with no shape to it", () => {
  // Each of these is a real file. `A - B` genuinely does not say which
  // half is the author, and claiming one would be a fact the user then
  // has to notice and delete.
  for (const name of [
    "Egan-Learning-to-Be-Me.pdf",
    "resume - Karter Whitman.pdf",
    "Transport Card-WhitmanKarter.pdf",
    "202._mind_wandering.pdf",
    "notes.md",
  ]) {
    assert.deepEqual(nameSays(name), {}, name);
  }
});

await check("refuses a number that merely looks like an isbn", () => {
  // A real CIA document number: thirteen digits with hyphens in the
  // right places. The check digit is what says it isn't an isbn, and a
  // wrong identifier is worse than none because nothing downstream can
  // tell it is wrong.
  assert.deepEqual(nameSays("cia-rdp96-00788r001900760001-9.pdf"), {});
});

await check("dates a file only where the name annotates a year", () => {
  // A bare four-digit run is a counter far more often than a year:
  // IMG_2024 is frame 2024, and dating it would be inventing a fact.
  assert.deepEqual(nameSays("IMG_2024.pdf"), {});
  assert.deepEqual(nameSays("DSC_1999.jpg"), {});
  assert.equal(nameSays("Dune (1965).epub")["published"], "1965-01-01");
});

console.log("\nwhen two sources disagree");

await check("lets the name outrank the file's own metadata", async () => {
  // The whole reason the filename is a source and not a fallback: a
  // producer's date is about the file, a name's year is about the work.
  const filepath = writePdf("Frank Herbert - Dune Messiah (1969).pdf", {
    info: { Title: literal("Dune"), CreationDate: literal("D:20190725100934+03'00'") },
  });
  const { entries: fields } = await extract("book", await probeOf(filepath));

  assert.equal(valueOf(fields, "published"), "1969-01-01");
  assert.equal(valueOf(fields, "title"), "Dune Messiah");
});

await check("keeps one row when both sources name the same thing", async () => {
  // The trap: without settling by key, the schema's field claims the
  // filename's title and the file's own title survives as a loose row
  // beside it. Invisible in any test with a single source in it.
  const filepath = writePdf("Frank Herbert - Dune Messiah (1969).pdf", {
    info: { Title: literal("Dune") },
  });
  const { entries: fields } = await extract("book", await probeOf(filepath));

  assert.deepEqual(
    fields.filter((f) => f.attribute === "title").map((f) => f.value),
    ["Dune Messiah"],
  );
});

await check("drops what the type has no word for when asked to", async () => {
  const probe = await probeOf(writePdf("quiet.pdf"));
  const wanted = schema([field("title"), field("author")]);

  // What `index` passes: someone filling in a curated item asked for
  // that type's fields, and rows it never asked for are noise there.
  const { entries: fields } = await extract("book", probe, wanted, { keepUnmatched: false });
  assert.deepEqual(fields.map((f) => f.attribute), ["author"]);

  // Intake still keeps them, which is what it shipped doing.
  const kept = await extract("book", probe, wanted);
  assert.ok(kept.entries.length > 1);
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
  const { name, entries: fields } = await extract("book", probe);

  // A reader has no opinion about which of its findings is the item's
  // name — the type says so, and this one was asked without a schema.
  assert.equal(name, undefined);
  assert.deepEqual(fields, [
    { attribute: "title", value: "Dune", kind: "string", prov: "auto" },
    { attribute: "author", value: "Frank Herbert", kind: "string", prov: "auto" },
    { attribute: "published", value: "1965-08-01", kind: "date", prov: "auto" },
    { attribute: "genre", value: ["Science Fiction", "Politics"], kind: "list", prov: "auto" },
    { attribute: "isbn", value: "9780441013593", kind: "string", prov: "auto" },
  ]);
});

await check("reports a lone value as itself, not a list of one", async () => {
  const probe = await probeOf(
    await writeEpub("single.epub", "application/epub+zip", { subjects: ["Cyberpunk"] }),
  );
  const genre = (await extract("book", probe)).entries.find((f) => f.attribute === "genre");
  assert.deepEqual(genre, { attribute: "genre", value: "Cyberpunk", kind: "string", prov: "auto" });
});

await check("reads the file for a type it has never heard of", async () => {
  // The type gate is only a gate: it asks whether this is worth opening
  // a file for, never which reader runs. Before, extraction fired only
  // for the three types the classifier itself invents, so a user naming
  // their own `textbook` silently turned it off.
  const probe = await probeOf(await writeEpub("textbook.epub"));
  const { entries: fields } = await extract("textbook", probe);
  assert.equal(fields.find((f) => f.attribute === "title")?.value, "Dune");
});

await check("has nothing to say about an item with no type at all", async () => {
  const probe = await probeOf(await writeEpub("untyped.epub"));
  assert.deepEqual(await extract(null, probe), { entries: [] });
});

await check("survives a file that is not the book it was typed as", async () => {
  const probe = await probeOf(write("lying.epub", Buffer.from("not a zip at all")));
  assert.deepEqual(await extract("book", probe), { entries: [] });
});

console.log("\nthe schema join: the file's words, the type's names");

const said = (key: string, value: DataEntry["value"] = "x", kind: AttributeKind = "string") =>
  ({ key, value, kind });

const namesOf = (entries: DataEntry[]) => entries.map((entry) => entry.attribute);

await check("passes keys through verbatim when the type declares no fields", () => {
  const observations = [said("title", "Dune"), said("author", "Frank Herbert")];
  assert.deepEqual(toEntries(observations), {
    entries: [
      { attribute: "title", value: "Dune", kind: "string", prov: "auto" },
      { attribute: "author", value: "Frank Herbert", kind: "string", prov: "auto" },
    ],
  });
  assert.deepEqual(toEntries(observations, schema([])), toEntries(observations));
});

await check("lands an observation in the field the schema calls it", () => {
  const joined = toEntries(
    [said("title", "Dune"), said("author", "Frank Herbert")],
    schema([field("title"), field("writer")]),
  );

  // The case the whole join exists for: one row, named as the type
  // declares, instead of an empty `writer` beside an orphan `author`.
  assert.deepEqual(joined.entries, [{ attribute: "writer", value: "Frank Herbert", kind: "string", prov: "auto" }]);
});

await check("ignores case, spaces, underscores and hyphens in a name", () => {
  for (const declared of ["Published", "PUBLISHED_DATE", "release-date", "Release Date"]) {
    // A leading field the observations never match, so the one under test
    // is a row rather than the item's name.
    const joined = toEntries(
      [said("published", "1965")],
      schema([field("unmatched"), field(declared, "date")]),
    );
    assert.deepEqual(namesOf(joined.entries), [declared], declared);
  }
});

await check("prefers an exact name over another field's synonym", () => {
  // `writer` is declared first and would match by synonym, but `author`
  // is what the observation is actually called, so it wins regardless of
  // declaration order.
  const joined = toEntries(
    [said("author", "Frank Herbert")],
    schema([field("writer"), field("author")]),
  );
  assert.deepEqual(joined.entries, [{ attribute: "author", value: "Frank Herbert", kind: "string", prov: "auto" }]);
});

await check("never hands one observation to two fields", () => {
  const joined = toEntries(
    [said("author", "Frank Herbert")],
    schema([field("unmatched"), field("author"), field("creator")]),
  );
  assert.deepEqual(namesOf(joined.entries), ["author"]);
});

await check("takes the kind the schema declares, and reshapes the value", () => {
  const toList = toEntries(
    [said("genre", "Science Fiction")],
    schema([field("unmatched"), field("genre", "list")]),
  );
  assert.deepEqual(toList.entries, [{ attribute: "genre", value: ["Science Fiction"], kind: "list", prov: "auto" }]);

  const toText = toEntries(
    [said("genre", ["Science Fiction", "Politics"], "list")],
    schema([field("unmatched"), field("genre", "string")]),
  );
  assert.deepEqual(toText.entries, [
    { attribute: "genre", value: "Science Fiction, Politics", kind: "string", prov: "auto" },
  ]);
});

await check("keeps what the file said that the type has no word for", () => {
  const joined = toEntries(
    [said("title", "Dune"), said("isbn", "9780441013593")],
    schema([field("title")]),
  );

  // Dropping it would lose something the file really declared; a row the
  // user can delete is the honest fallback.
  assert.deepEqual(namesOf(joined.entries), ["isbn"]);
  assert.equal(joined.name, "Dune");
});

await check("does not write empty rows for fields nothing matched", () => {
  const joined = toEntries(
    [said("title", "Dune"), said("isbn", "978")],
    schema([field("title"), field("isbn"), field("pages", "number")]),
  );

  // The layout already draws a type's declared fields from the schema,
  // so emitting blanks here would put them on the item twice.
  assert.deepEqual(namesOf(joined.entries), ["isbn"]);
});

await check("orders matched rows the way the type declares them", () => {
  const joined = toEntries(
    [said("isbn", "978"), said("title", "Dune"), said("author", "Frank Herbert")],
    schema([field("title"), field("writer"), field("isbn")]),
  );
  assert.deepEqual(namesOf(joined.entries), ["writer", "isbn"]);
});

await check("joins a real epub's metadata onto a schema that renames it", async () => {
  const probe = await probeOf(await writeEpub("joined.epub"));
  const { name, entries: fields } = await extract(
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
    { attribute: "writer", value: "Frank Herbert", kind: "string", prov: "auto" },
    { attribute: "year", value: "1965-08-01", kind: "date", prov: "auto" },
    { attribute: "categories", value: ["Science Fiction", "Politics"], kind: "list", prov: "auto" },
    { attribute: "isbn", value: "9780441013593", kind: "string", prov: "auto" },
  ]);
});

console.log("\nthe first field is the item's name");

await check("takes the first field's value as the name, and writes no row for it", () => {
  const joined = toEntries(
    [said("title", "Flatland"), said("author", "Edwin Abbott Abbott")],
    schema([field("title"), field("author")]),
  );

  assert.equal(joined.name, "Flatland");
  assert.deepEqual(namesOf(joined.entries), ["author"]);
});

await check("says nothing when the first field matched nothing", () => {
  const joined = toEntries(
    [said("author", "Edwin Abbott Abbott")],
    schema([field("title"), field("author")]),
  );

  // The type wants its name from the title and the file never gave one,
  // so whatever intake derived from the path stands.
  assert.equal(joined.name, undefined);
  assert.deepEqual(namesOf(joined.entries), ["author"]);
});

await check("reordering the type moves the name with it", () => {
  const observations = [said("title", "Flatland"), said("author", "Edwin Abbott Abbott")];
  const byAuthor = toEntries(observations, schema([field("author"), field("title")]));

  // Nothing about the word `title` is special — position is, which is the
  // point: a `person` type's `title` means Dr., not a name. Dragging a
  // field to the top is the same gesture as promoting a resource.
  assert.equal(byAuthor.name, "Edwin Abbott Abbott");
  assert.deepEqual(namesOf(byAuthor.entries), ["title"]);
});

await check("flattens a list into the one line a name has to be", () => {
  const joined = toEntries(
    [said("author", ["Gilbert", "Sullivan"], "list")],
    schema([field("author", "list")]),
  );
  assert.equal(joined.name, "Gilbert, Sullivan");
});

await check("a type whose only field is its name draws no rows at all", () => {
  const joined = toEntries([said("title", "Flatland")], schema([field("title")]));
  assert.equal(joined.name, "Flatland");
  assert.deepEqual(joined.entries, []);
});

await check("names an item from a real epub, end to end", async () => {
  const probe = await probeOf(await writeEpub("named.epub"));
  const { name, entries: fields } = await extract("book", probe, schema([field("title"), field("author")]));

  assert.equal(name, "Dune");
  assert.equal(fields.find((f) => f.attribute === "title"), undefined);
  assert.deepEqual(fields.find((f) => f.attribute === "author")?.value, "Frank Herbert");
});

await check("joins the same epub onto a schema that wants one line instead", async () => {
  const probe = await probeOf(await writeEpub("flattened.epub"));
  const { entries: fields } = await extract(
    "book",
    probe,
    schema([field("title"), field("genre", "string")]),
  );

  // The other direction, and the reason the extractor reports the shape
  // it found: a type declaring `string` still gets the joined line it
  // used to get, without the extractor knowing that type exists.
  assert.deepEqual(fields.find((f) => f.attribute === "genre"), {
    attribute: "genre",
    value: "Science Fiction, Politics",
    kind: "string",
    prov: "auto",
  });
});

await check("names an item from a pdf against the type its schema declares", async () => {
  const probe = await probeOf(writePdf("joined.pdf"));
  const { name, entries: fields } = await extract(
    "document",
    probe,
    schema([field("title"), field("writer"), field("summary"), field("length", "number")]),
  );

  // The same join the epub goes through, over a different vocabulary:
  // the leading field takes the name, and `writer`/`summary`/`length`
  // reach author/description/pages by synonym, while what the type has
  // no word for stays visible as its own row.
  assert.equal(name, "Dune");
  assert.deepEqual(fields, [
    { attribute: "writer", value: "Frank Herbert", kind: "string", prov: "auto" },
    { attribute: "summary", value: "A boy, a desert, a spice", kind: "string", prov: "auto" },
    { attribute: "length", value: "3", kind: "number", prov: "auto" },
    { attribute: "published", value: "1965-08-01", kind: "date", prov: "auto" },
    { attribute: "genre", value: ["Science Fiction", "Politics"], kind: "list", prov: "auto" },
  ]);
});

fs.rmSync(workspace, { recursive: true, force: true });

console.log(`\n${passed} assertions passed\n`);
