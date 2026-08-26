// Authored by Karter Whitman using Claude Opus 5
// The regression anchor for the modeling pipeline.
//
// Fixtures are built here rather than committed. What the collectors have
// to cope with *is* the structure — an epub's prescribed first entry, a
// pdf whose index is at the end, two packets where only one is the
// document's — and a checked-in binary would hide every bit of it.
//
// **No weights are needed to run this.** The model is reached through a
// port, and the suite injects a stub, so the whole pipeline — including
// grounding, which only applies to model values — is exercised without a
// 730 MB download. That is the point of the seam: what these tests prove
// is that the machinery is correct, and no fixture can prove the model is
// *right* about real books. `npm run survey` answers that, against a real
// library.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { Data, Item, Schema, SchemaAttribute } from "@index/database/types";
import { modelItem } from "../src/index.js";
import type { ItemModelingOutcome, ModelingSuccess } from "../src/contracts/index.js";
import type { ModelClient } from "../src/collector/language-model/local-model-client.js";
import { groundValue } from "../src/composer/validation/validate-provenance.js";
import { findIsbn, isIsbn } from "../src/contracts/normalize-identifiers.js";
import { normalizePersonName } from "../src/composer/normalization/normalize-names.js";
import { itemFor, type ItemOptions } from "./item.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "index-modeler-"));

// ---------------------------------------------------------------------
// the type under test
// ---------------------------------------------------------------------

const field = (attribute: string, kind: SchemaAttribute["kind"] = "string"): SchemaAttribute => ({
  attribute,
  kind,
  display: true,
});

/** `attributes[0]` is the item's name, the way `resources[0]` is primary. */
const BOOK: Schema = {
  id: "schemas:book",
  name: "book",
  attributes: [
    field("title"),
    field("author"),
    field("published", "date"),
    field("publisher"),
    field("isbn"),
    field("subject", "list"),
  ],
};

// ---------------------------------------------------------------------
// the model, stubbed
//
// A stub rather than the real weights, because a test asserting what a
// neural network says is a test of the network. What is worth pinning is
// the *contract around* it: that nulls are honoured, that an ungrounded
// answer is thrown away, that a failure degrades rather than propagates.
// So the stub is programmable and each test says what the model returns.
// ---------------------------------------------------------------------

interface Stub {
  answer: Record<string, string | null>;
  fail?: string;
  calls: { system: string; user: string }[];
}

function stubModel(answer: Record<string, string | null> = {}, fail?: string): Stub {
  return { answer, ...(fail ? { fail } : {}), calls: [] };
}

/** The stub as a `ModelClient`, passed through `options.model` — the same
 * port the Electron app will use to supply the real one. */
function clientFor(stub: Stub): ModelClient {
  return {
    async extract(request) {
      stub.calls.push({ system: request.system, user: request.user });
      if (stub.fail) throw new Error(stub.fail);
      return stub.answer as Record<string, unknown>;
    },
    describe: () => ({ name: "stub", quantization: "none" }),
    dispose: async () => {},
  };
}

function itemWith(filepath: string, overrides: ItemOptions = {}): Item {
  return itemFor(filepath, overrides);
}

async function model(
  item: Item,
  options: Parameters<typeof modelItem>[2] = {},
): Promise<ItemModelingOutcome> {
  return modelItem(item, BOOK, {
    derivedName: item.resources[0]?.name ?? null,
    now: () => new Date("2026-08-16T00:00:00Z"),
    ...options,
  });
}

function modeled(outcome: ItemModelingOutcome): ModelingSuccess {
  assert.equal(outcome.status, "modeled", `expected success, got ${JSON.stringify(outcome)}`);
  return outcome as ModelingSuccess;
}

const valueOf = (data: Data, name: string) => data[name.toLowerCase()]?.value;

const nameOf = (item: Item) => item.data.name.value;

const actionFor = (result: ModelingSuccess, name: string) =>
  result.changes.find((change) => change.field === name)?.action;

const provenanceFor = (result: ModelingSuccess, name: string) =>
  result.changes.find((change) => change.field === name)?.provenance;

// ---------------------------------------------------------------------
// epub fixtures — the OCF layout, `mimetype` first and stored
// uncompressed so its media type sits at a fixed offset in the opening
// bytes. That placement is what identification relies on.
// ---------------------------------------------------------------------

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function opfFor(options: { subjects?: string[]; identifiers?: string[]; creator?: string } = {}) {
  const subjects = options.subjects ?? ["Science Fiction", "Politics"];
  const identifiers = options.identifiers ?? ["urn:uuid:not-an-isbn", "ISBN 978-0-441-01359-3"];
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>${options.creator ?? "Herbert, Frank"}</dc:creator>
    <dc:date>1965-08-01T00:00:00Z</dc:date>
    <dc:publisher>Chilton Books</dc:publisher>
${subjects.map((subject) => `    <dc:subject>${subject}</dc:subject>`).join("\n")}
${identifiers.map((identifier) => `    <dc:identifier>${identifier}</dc:identifier>`).join("\n")}
  </metadata>
</package>`;
}

async function writeEpub(filename: string, opf = opfFor()): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", opf);
  const filepath = path.join(workspace, filename);
  await fs.promises.writeFile(filepath, await zip.generateAsync({ type: "nodebuffer" }));
  return filepath;
}

// ---------------------------------------------------------------------
// pdf fixtures
// ---------------------------------------------------------------------

const literal = (text: string) => `(${text.replace(/([\\()])/g, "\\$1")})`;

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
  CreationDate: literal("D:19650801120000-05'00'"),
  Producer: literal("Index Test Suite"),
};

const xmpWith = (body: string) => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
${body}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

const DOCUMENT_XMP = xmpWith(`    <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Dune</rdf:li></rdf:Alt></dc:title>
    <dc:creator><rdf:Seq><rdf:li>Frank Herbert</rdf:li></rdf:Seq></dc:creator>
    <dc:publisher><rdf:Bag><rdf:li>Chilton Books</rdf:li></rdf:Bag></dc:publisher>
    <dc:description>A boy, a desert, a spice.</dc:description>
    <dc:identifier>ISBN 978-0-441-01359-3</dc:identifier>
    <dc:date>1965-08-01</dc:date>`);

/** An embedded logo's packet, written *ahead* of the document's — the
 * ordering that made this a bug rather than a theory. */
const LOGO_XMP = xmpWith(`    <dc:title><rdf:Alt><rdf:li>Publisher Logo</rdf:li></rdf:Alt></dc:title>
    <dc:creator><rdf:Seq><rdf:li>Design Department</rdf:li></rdf:Seq></dc:creator>
    <tiff:ImageWidth>512</tiff:ImageWidth>
    <tiff:Make>Adobe Illustrator</tiff:Make>`);

interface PdfOptions {
  info?: Record<string, string> | null;
  xmp?: string;
  leadingXmp?: string;
  filler?: number;
}

function writePdf(filename: string, options: PdfOptions = {}): string {
  const info = options.info === undefined ? INFO : options.info;
  const parts = ["%PDF-1.7\n"];

  if (options.leadingXmp) parts.push(`% ${options.leadingXmp.replace(/\n/g, "\n% ")}\n`);
  if (options.filler) parts.push(`%${"f".repeat(options.filler)}\n`);

  parts.push(
    object(
      1,
      dict({ Type: "/Catalog", Pages: "2 0 R", ...(options.xmp ? { Metadata: "4 0 R" } : {}) }),
    ),
    object(2, dict({ Type: "/Pages", Count: "412", Kids: "[]" })),
  );
  if (info) parts.push(object(3, dict(info)));
  if (options.xmp) {
    parts.push(
      streamObject(4, { Type: "/Metadata", Subtype: "/XML" }, Buffer.from(options.xmp, "utf8")),
    );
  }
  parts.push(
    `trailer\n${dict({ Size: "6", Root: "1 0 R", ...(info ? { Info: "3 0 R" } : {}) })}\n`,
    "startxref\n0\n%%EOF\n",
  );

  const filepath = path.join(workspace, filename);
  fs.writeFileSync(filepath, Buffer.from(parts.join(""), "latin1"));
  return filepath;
}

// ---------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\nnormalization");

  await check("an isbn's check digit is what separates it from a number", () => {
    assert.equal(isIsbn("978-0-441-01359-3"), true);
    assert.equal(isIsbn("0-441-01359-7"), true);
    // Valid-length runs of digits that are not isbns. Document numbers
    // and product codes reach this shape constantly.
    assert.equal(isIsbn("978-0-441-01359-4"), false);
    assert.equal(isIsbn("1978041300012"), false);
  });

  await check("an isbn-10 and its isbn-13 are one identifier, not two", () => {
    assert.equal(findIsbn("0-441-01359-7"), "9780441013593");
    assert.equal(findIsbn("978-0-441-01359-3"), "9780441013593");
  });

  await check("a sorted name is put back in reading order", () => {
    assert.equal(normalizePersonName("Herbert, Frank"), "Frank Herbert");
    assert.equal(normalizePersonName("King, Martin Luther, Jr."), "Martin Luther King Jr.");
    assert.equal(normalizePersonName("Frank Herbert"), "Frank Herbert");
    assert.equal(normalizePersonName("Yale University Press"), "Yale University Press");
  });

  console.log("\ngrounding — the check that makes synthesis safe");

  await check("a rearranged value is grounded; an invented one is not", () => {
    const evidence = "Wallis, Christopher D - Tantra Illuminated\nMattamayura Press\n2013";
    // Reordering is the work being asked for, so it must pass.
    assert.equal(groundValue("Christopher Wallis", evidence).grounded, true);
    assert.equal(groundValue("Tantra Illuminated", evidence).grounded, true);
    // Nowhere in the evidence, however plausible it reads.
    assert.equal(groundValue("Oxford University Press", evidence).grounded, false);
  });

  await check("a nearly-right identifier is not nearly grounded", () => {
    const evidence = "verified isbn 9780441013593";
    assert.equal(groundValue("9780441013593", evidence).grounded, true);
    // One digit out is a different book. Digits are held to the whole,
    // which is exactly how a plausible ISBN gets invented.
    assert.equal(groundValue("9780441013594", evidence).grounded, false);
    // The shape the real model actually produced, out of nothing.
    assert.equal(groundValue("10.1234/9781", evidence).grounded, false);
  });

  await check("a value of nothing but noise words cannot be grounded", () => {
    assert.equal(groundValue("the and of", "the book of and").grounded, false);
  });

  console.log("\ntranscribing what a file states");

  await check("an epub's package document is taken at its word", async () => {
    const filepath = await writeEpub("dune.epub");
    const result = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));

    assert.equal(nameOf(result.item), "Dune");
    // Canonicalised on the way out: the OPF says `Herbert, Frank`.
    assert.equal(valueOf(result.item.data, "author"), "Frank Herbert");
    assert.equal(valueOf(result.item.data, "publisher"), "Chilton Books");
    assert.equal(valueOf(result.item.data, "isbn"), "9780441013593");
    assert.equal(provenanceFor(result, "author")?.method, "epub-opf");
    assert.equal(provenanceFor(result, "isbn")?.method, "checksum");
  });

  await check("a transcribed fact never reaches the model", async () => {
    const filepath = await writeEpub("dune-skip.epub");
    const stub = stubModel({ published: "1965", subject: "Science Fiction" });
    modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    // The schema sent to the model must not contain the settled fields —
    // a field absent from the grammar cannot be overwritten by a worse
    // answer, which is the whole reason for leaving it out.
    const system = stub.calls[0]?.system ?? "";
    assert.ok(!system.includes('"title"'), "title was settled and should not have been asked");
    assert.ok(!system.includes('"author"'), "author was settled and should not have been asked");
    assert.ok(system.includes('"published"'), "published is not transcribed and must be asked");
  });

  await check("a pdf's own metadata is evidence, not transcription", async () => {
    // A PDF's Info dictionary is an optional grab-bag written by whatever
    // produced the file, so it goes to the model as evidence rather than
    // being copied out. With no model, a pdf yields nothing.
    const filepath = writePdf("info-only.pdf");
    const result = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));

    assert.equal(result.changes.filter((change) => change.action === "populated").length, 0);
  });

  console.log("\nthe basket");

  await check("the model is shown the filename and the file's own claims", async () => {
    const filepath = writePdf("both.pdf", { info: INFO, xmp: DOCUMENT_XMP });
    const stub = stubModel({});
    modeled(await model(itemWith(filepath), { debugDiagnostics: true, model: clientFor(stub) }));

    const evidence = stub.calls[0]?.user ?? "";
    assert.match(evidence, /filename: both\.pdf/);
    assert.match(evidence, /pdf\.xmp\.dc:title: Dune/);
    assert.match(evidence, /pdf\.Info\.Author: Frank Herbert/);
    // Qualified names throughout, so `rdf:Description` cannot be read as
    // `dc:description`.
    assert.ok(!evidence.includes("rdf:Description"));
  });

  await check("an embedded logo's packet is not read as the document's", async () => {
    const filepath = writePdf("logo.pdf", {
      info: null,
      leadingXmp: LOGO_XMP,
      xmp: DOCUMENT_XMP,
    });
    const stub = stubModel({});
    modeled(await model(itemWith(filepath), { debugDiagnostics: true, model: clientFor(stub) }));

    const evidence = stub.calls[0]?.user ?? "";
    assert.match(evidence, /Dune/);
    assert.ok(!evidence.includes("Design Department"), "the logo's packet leaked into the basket");
  });

  await check("a verified identifier is handed over already settled", async () => {
    const filepath = writePdf("isbn.pdf", { info: null, xmp: DOCUMENT_XMP });
    const stub = stubModel({});
    modeled(await model(itemWith(filepath), { debugDiagnostics: true, model: clientFor(stub) }));
    assert.match(stub.calls[0]?.user ?? "", /verified_isbn13: 9780441013593/);
  });

  console.log("\nsynthesis, and what bounds it");

  await check("a grounded model answer is written, with its support recorded", async () => {
    const filepath = writePdf(
      "William Gibson - Neuromancer  -Ace Hardcover (2004).pdf",
      { info: null },
    );
    const stub = stubModel({
      title: "Neuromancer",
      author: "William Gibson",
      published: "2004",
      publisher: "Ace Hardcover",
    });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    // The reading no regex ladder managed: the publisher is split off the
    // title even though the hyphen has no space before it.
    assert.equal(nameOf(result.item), "Neuromancer");
    assert.equal(valueOf(result.item.data, "publisher"), "Ace Hardcover");
    const provenance = provenanceFor(result, "author");
    assert.equal(provenance?.origin, "language-model");
    assert.equal(provenance?.model?.name, "stub");
    // Confidence is measured grounding support, not the model's opinion.
    assert.equal(typeof provenance?.confidence, "number");
  });

  await check("an ungrounded answer is thrown away, with a warning", async () => {
    const filepath = writePdf("ungrounded.pdf", { info: null });
    const stub = stubModel({
      title: "The Complete Works of Somebody Entirely Different",
      publisher: "Oxford University Press",
    });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    assert.equal(valueOf(result.item.data, "publisher"), undefined);
    const rejected = result.warnings.filter((warning) => warning.code === "value-rejected");
    assert.ok(rejected.length >= 1, "an invented value must be rejected");
    assert.match(rejected[0]?.message ?? "", /not supported by the evidence/);
    assert.ok(result.meta.claims.rejected >= 1);
  });

  await check("an invented isbn dies twice over", async () => {
    const filepath = writePdf("fake-isbn.pdf", { info: null });
    // The shape the real model produced, unprompted, on a real book.
    const stub = stubModel({ isbn: "10.1234/9780128154321" });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    assert.equal(valueOf(result.item.data, "isbn"), undefined);
  });

  await check("an answer that just repeats another field is not an answer", async () => {
    const filepath = await writeEpub("dune-echo.epub");
    // What the model actually does when a field is unsupported: rather
    // than declining it returns the most prominent string in front of
    // it. Grounding cannot catch this — the title really is in the
    // evidence — so the check has to be about where the value landed.
    const stub = stubModel({ subject: "Dune", published: "1965" });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    assert.equal(valueOf(result.item.data, "subject"), undefined);
    assert.equal(valueOf(result.item.data, "published"), "1965");
    assert.ok(
      result.warnings.some(
        (warning) => warning.code === "value-rejected" && warning.field === "subject",
      ),
    );
  });

  await check("a transcribed fact is never dropped as an echo", async () => {
    // A self-published book states an author and a publisher that are the
    // same person. The file said so, so it stands.
    const filepath = await writeEpub(
      "self-published.epub",
      opfFor({ creator: "Jane Roe" }).replace("<dc:publisher>Chilton Books", "<dc:publisher>Jane Roe"),
    );
    const result = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));

    assert.equal(valueOf(result.item.data, "author"), "Jane Roe");
    assert.equal(valueOf(result.item.data, "publisher"), "Jane Roe");
  });

  await check("a pdf's producer software never reaches the basket", async () => {
    const filepath = writePdf("tooling.pdf", {
      info: null,
      xmp: xmpWith(`    <dc:title><rdf:Alt><rdf:li>Dune</rdf:li></rdf:Alt></dc:title>
    <pdf:Producer>Antenna House PDF Output Library</pdf:Producer>
    <xmp:CreatorTool>Adobe InDesign CS6</xmp:CreatorTool>
    <dc:format>application/pdf</dc:format>`),
    });
    const stub = stubModel({});
    modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    const evidence = stub.calls[0]?.user ?? "";
    assert.match(evidence, /Dune/);
    // All three grounded perfectly well and were all completely wrong:
    // two became publishers, one became a subject.
    assert.ok(!evidence.includes("Antenna House"), "producer leaked into the basket");
    assert.ok(!evidence.includes("InDesign"), "creator tool leaked into the basket");
    assert.ok(!evidence.includes("application/pdf"), "the media type leaked in as content");
  });

  await check("a null is the model declining, and is not a value", async () => {
    const filepath = writePdf("IMG_2024.pdf", { info: null });
    const stub = stubModel({ title: null, author: null, published: null, publisher: null });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    assert.equal(result.changes.filter((change) => change.action === "populated").length, 0);
    assert.equal(nameOf(result.item), "IMG_2024.pdf", "the minted name should stand");
  });

  await check("a model failure degrades the run rather than failing it", async () => {
    const filepath = await writeEpub("dune-degraded.epub");
    const stub = stubModel({}, "the model server fell over");
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    // Everything the file stated outright still stands.
    assert.equal(nameOf(result.item), "Dune");
    assert.equal(valueOf(result.item.data, "author"), "Frank Herbert");
    assert.ok(result.warnings.some((warning) => warning.message.includes("did not answer")));
  });

  await check("a missing model says so rather than passing in silence", async () => {
    const filepath = await writeEpub("dune-nomodel.epub");
    // Pointed at an empty directory rather than trusting the machine: the
    // weights may well be installed here, and a test whose meaning
    // depends on that passes or fails for reasons unrelated to the code.
    const previous = process.env["INDEX_MODELS_DIR"];
    process.env["INDEX_MODELS_DIR"] = path.join(workspace, "no-models");
    try {
      const result = modeled(await model(itemWith(filepath)));
      assert.equal(valueOf(result.item.data, "author"), "Frank Herbert");
      assert.ok(
        result.warnings.some((warning) => warning.message.includes("not installed")),
        "'nobody looked' and 'the book does not say' are different facts",
      );
    } finally {
      if (previous === undefined) delete process.env["INDEX_MODELS_DIR"];
      else process.env["INDEX_MODELS_DIR"] = previous;
    }
  });

  console.log("\nowning what the user owns");

  await check("a user's value is never overwritten, and the disagreement is recorded", async () => {
    const filepath = await writeEpub("dune-conflict.epub");
    const item = itemWith(filepath, {
      entries: [{ attribute: "author", value: "Someone Else", kind: "string", prov: "user" }],
    });
    const result = modeled(
      await model(item, { userFields: ["author"], languageModelMode: "never" }),
    );

    assert.equal(valueOf(result.item.data, "author"), "Someone Else");
    assert.equal(actionFor(result, "author"), "conflicted");
    const conflict = result.conflicts.find((entry) => entry.field === "author");
    assert.equal(conflict?.challengers[0]?.value, "Frank Herbert");
  });

  await check("a filled field with nothing marking it is treated as the user's", async () => {
    const filepath = await writeEpub("dune-implicit.epub");
    const item = itemWith(filepath, {
      entries: [{ attribute: "publisher", value: "Ace Books", kind: "string", prov: "user" }],
    });
    const result = modeled(await model(item, { languageModelMode: "never" }));

    assert.equal(valueOf(result.item.data, "publisher"), "Ace Books");
    assert.equal(actionFor(result, "publisher"), "conflicted");
  });

  await check("a sorted name confirms rather than conflicts with a read one", async () => {
    const filepath = await writeEpub("dune-sorted.epub");
    const item = itemWith(filepath, {
      entries: [{ attribute: "author", value: "Frank Herbert", kind: "string", prov: "user" }],
    });
    const result = modeled(
      await model(item, { userFields: ["author"], languageModelMode: "never" }),
    );
    assert.equal(actionFor(result, "author"), "confirmed");
    assert.equal(result.conflicts.length, 0);
  });

  await check("the name is taken only while it is still the resource's", async () => {
    const filepath = await writeEpub("dune-renamed.epub");
    const renamed = itemWith(filepath, { name: "My favourite book" });
    const result = modeled(await model(renamed, { languageModelMode: "never" }));

    assert.equal(nameOf(result.item), "My favourite book");
    assert.equal(result.changes.find((change) => change.target === "name")?.action, "skipped");
  });

  console.log("\nrefusing to invent");

  await check("a title that is really a path is rejected", async () => {
    const filepath = writePdf("rejects.pdf", { info: null });
    const stub = stubModel({ title: "C:\\Users\\karter\\Documents\\scan.pdf" });
    const result = modeled(await model(itemWith(filepath), { model: clientFor(stub) }));

    assert.equal(result.changes.find((change) => change.target === "name")?.action, undefined);
    assert.ok(result.warnings.some((warning) => warning.code === "value-rejected"));
  });

  await check("a field nothing established is reported, not invented", async () => {
    const filepath = writePdf("sparse.pdf", { info: { Title: literal("Dune") } });
    const result = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));

    assert.equal(valueOf(result.item.data, "isbn"), undefined);
    assert.ok(
      result.warnings.some(
        (warning) => warning.code === "field-unsupported" && warning.field === "isbn",
      ),
    );
  });

  console.log("\nthe change set");

  await check("every written value carries its provenance", async () => {
    const filepath = await writeEpub("dune-provenance.epub");
    const result = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));

    for (const change of result.changes) {
      if (change.action !== "populated") continue;
      assert.ok(change.provenance, `${change.field} was written without provenance`);
      assert.ok(change.provenance?.sourceIds.length);
      assert.ok(change.provenance?.method);
      assert.ok(change.provenance?.location);
    }
  });

  await check("provenance can be turned off without changing the values", async () => {
    const filepath = await writeEpub("dune-quiet.epub");
    const result = modeled(
      await model(itemWith(filepath), { includeProvenance: false, languageModelMode: "never" }),
    );

    assert.equal(valueOf(result.item.data, "author"), "Frank Herbert");
    assert.ok(result.changes.every((change) => change.provenance === undefined));
  });

  console.log("\nrunning twice");

  await check("re-modeling an unchanged item populates nothing", async () => {
    const filepath = await writeEpub("dune-idempotent.epub");
    const first = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));
    const second = modeled(
      await model(first.item, {
        derivedName: path.basename(filepath),
        languageModelMode: "never",
      }),
    );

    assert.equal(
      second.changes.filter((change) => change.action === "populated").length,
      0,
      "a second run should confirm, not populate",
    );
    assert.deepEqual(second.item.data, first.item.data);
    assert.equal(second.meta.fingerprint, first.meta.fingerprint);
  });

  await check("the fingerprint covers the prompt, not just the sources", async () => {
    const filepath = await writeEpub("dune-fingerprint.epub");
    const a = modeled(await model(itemWith(filepath), { languageModelMode: "never" }));
    const b = modeled(await model(itemWith(filepath), { languageModelMode: "always" }));
    // Asking a different question is a different run, even over
    // identical bytes.
    assert.notEqual(a.meta.fingerprint, b.meta.fingerprint);
  });

  console.log("\nfailing honestly");

  await check("an item with no type is refused, not guessed at", async () => {
    const filepath = await writeEpub("dune-untyped.epub");
    const outcome = await model(itemWith(filepath, { type: null }));
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "no-type");
  });

  await check("inferring a type is refused rather than silently ignored", async () => {
    const filepath = await writeEpub("dune-infer.epub");
    const outcome = await model(itemWith(filepath), { inferType: true });
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "invalid-input");
  });

  await check("an item with no sources is a failure, not an empty success", async () => {
    const outcome = await modelItem(
      { ...itemWith(path.join(workspace, "nothing")), resources: [] },
      BOOK,
    );
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "no-sources");
  });

  await check("an unreadable source returns a failure, not a half-filled item", async () => {
    const outcome = await model(itemWith(path.join(workspace, "gone.epub")));
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "no-evidence");
  });

  await check("one unreadable source among several does not stop the run", async () => {
    const filepath = await writeEpub("dune-partial.epub");
    const item = itemWith(filepath);
    item.resources.push({ uri: path.join(workspace, "also-gone.pdf"), name: "also-gone.pdf" });

    const result = modeled(await model(item, { languageModelMode: "never" }));
    assert.equal(valueOf(result.item.data, "author"), "Frank Herbert");
    assert.ok(result.warnings.some((warning) => warning.code === "source-unreadable"));
    assert.equal(result.meta.sources.read, 1);
    assert.equal(result.meta.sources.attached, 2);
  });

  await check("an oversized source is truncated and says so", async () => {
    // Past the 64 KB head, so the trailer is only reachable from the tail.
    const filepath = writePdf("large.pdf", { filler: 200_000, xmp: DOCUMENT_XMP });
    const stub = stubModel({});
    const result = modeled(
      await model(itemWith(filepath), { debugDiagnostics: true, model: clientFor(stub) }),
    );

    assert.equal(result.meta.truncated, true);
    assert.ok(result.warnings.some((warning) => warning.code === "source-truncated"));
    // And the metadata is still found: a pdf keeps its index at the end,
    // and the bounded tail read is what reaches it.
    assert.match(stub.calls[0]?.user ?? "", /Dune/);
  });

  await check("the network is not touched when it is not allowed", async () => {
    const item = itemWith(path.join(workspace, "unused.epub"), {
      resources: [{ uri: "https://example.com/book", name: "example.com/book" }],
    });
    const outcome = await model(item, { allowNetworkAccess: false });
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "no-evidence");
  });

  console.log(`\n${passed} checks passed\n`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });
