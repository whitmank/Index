// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the pdf reader: that it finds a document's
// own metadata wherever a real producer might have put it (an Info
// dictionary, an XMP packet, either one packed into a compressed object
// stream, or pushed past a 64 KB head into a file's tail), and that
// `typeOfPdf`'s ladder reads what the file declares before falling back
// to length. Same house style as ai-classifier.test.ts: no framework, an
// inline `check()` runner.
//
// Fixtures are built here rather than committed: a pdf is a graph of
// numbered objects with its index at the end, which is exactly the
// structure under test, and a checked-in binary would hide it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { readPdf, typeOfPdf, type BinarySource } from "../src/classification/trad/pdf-reader.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "item-modeler-pdf-"));

// Mirrors backend probe.ts's own bounds, so a fixture built to land past
// the head and inside the tail actually exercises that split here too.
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;

async function sourceOf(filepath: string): Promise<BinarySource> {
  const bytes = await fs.promises.readFile(filepath);
  const head = bytes.subarray(0, Math.min(bytes.length, HEAD_BYTES));
  return {
    head,
    size: bytes.length,
    tail: async () => bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES)),
  };
}

const literal = (text: string) => `(${text.replace(/([\\()])/g, "\\$1")})`;
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
  info?: Record<string, string> | null;
  pages?: number;
  xmp?: string;
  packed?: boolean;
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
  const filepath = path.join(workspace, filename);
  fs.writeFileSync(filepath, Buffer.from(parts.join(""), "latin1"));
  return filepath;
}

const metadataOf = async (filepath: string) => readPdf(await sourceOf(filepath));
const typeOf = async (filepath: string) => typeOfPdf(await metadataOf(filepath));

async function run(): Promise<void> {
  console.log("\nreading a file that keeps its metadata at the end");

  await check("reads the Info dictionary the trailer points at", async () => {
    const metadata = await metadataOf(writePdf("info.pdf"));
    assert.deepEqual(metadata, {
      title: "Dune",
      authors: ["Frank Herbert"],
      published: "1965-08-01",
      subjects: ["Science Fiction", "Politics"],
      pages: 3,
      description: "A boy, a desert, a spice",
    });
  });

  await check("decodes a title written in utf-16", async () => {
    const metadata = await metadataOf(
      writePdf("wide.pdf", { info: { Title: utf16("Kafka on the Shore 海辺のカフカ") } }),
    );
    assert.equal(metadata.title, "Kafka on the Shore 海辺のカフカ");
  });

  await check("splits several authors, and only where the file was unambiguous", async () => {
    const many = await metadataOf(writePdf("duo.pdf", { info: { Author: literal("Gilbert; Sullivan") } }));
    assert.deepEqual(many.authors, ["Gilbert", "Sullivan"]);

    const one = await metadataOf(writePdf("solo.pdf", { info: { Author: literal("Herbert, Frank") } }));
    assert.deepEqual(one.authors, ["Herbert, Frank"]);
  });

  await check("prefers what XMP says over the Info dictionary", async () => {
    const xmp = xmpWith(`   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Neuromancer</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>William Gibson</rdf:li></rdf:Seq></dc:creator>
   <dc:subject><rdf:Bag><rdf:li>Cyberpunk</rdf:li><rdf:li>Noir</rdf:li></rdf:Bag></dc:subject>`);
    const metadata = await metadataOf(writePdf("xmp.pdf", { xmp }));

    assert.equal(metadata.title, "Neuromancer");
    assert.deepEqual(metadata.authors, ["William Gibson"]);
    assert.deepEqual(metadata.subjects, ["Cyberpunk", "Noir"]);
  });

  await check("does not mistake rdf's own scaffolding for a property", async () => {
    const xmp = xmpWith(`   <dc:title><rdf:Alt><rdf:li>Dune</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li>A boy on a desert world</rdf:li></rdf:Alt></dc:description>`);
    const metadata = await metadataOf(writePdf("described.pdf", { info: null, xmp }));

    assert.equal(metadata.title, "Dune");
    assert.equal(metadata.description, "A boy on a desert world");
  });

  await check("reads XMP properties written as attributes", async () => {
    const xmp = xmpWith("", 'xmp:CreateDate="1984-07-01T00:00:00Z" dc:publisher="Ace Books"');
    const metadata = await metadataOf(writePdf("attributes.pdf", { info: null, xmp }));

    assert.equal(metadata.published, "1984-07-01");
    assert.equal(metadata.publisher, "Ace Books");
  });

  await check("finds an Info dictionary packed into a compressed object stream", async () => {
    const metadata = await metadataOf(writePdf("packed.pdf", { packed: true }));
    assert.equal(metadata.title, "Dune");
    assert.deepEqual(metadata.authors, ["Frank Herbert"]);
  });

  await check("reads the trailer of a file far too big to hold in a head", async () => {
    const filepath = writePdf("thick.pdf", { filler: 500_000 });
    assert.ok(fs.statSync(filepath).size > 500_000);
    assert.equal((await metadataOf(filepath)).title, "Dune");
  });

  await check("reports the length of a pdf that declares nothing else", async () => {
    const metadata = await metadataOf(writePdf("silent.pdf", { info: null, pages: 12 }));
    assert.deepEqual(metadata, { authors: [], subjects: [], pages: 12 });
  });

  await check("survives a file that claims to be a pdf and is not", async () => {
    const filepath = path.join(workspace, "torn.pdf");
    fs.writeFileSync(filepath, "%PDF-1.7\nand then nothing");
    assert.deepEqual(await metadataOf(filepath), { authors: [], subjects: [], pages: undefined });
  });

  console.log("\nwhich kind of document it is");

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
    assert.equal(await typeOf(writePdf("long.pdf", { pages: 412 })), "book");
  });

  await check("types every other pdf a document", async () => {
    assert.equal(await typeOf(writePdf("memo.pdf", { pages: 4 })), "document");
    assert.equal(await typeOf(writePdf("blank.pdf", { info: null })), "document");
  });

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
