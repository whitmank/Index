// Authored by Karter Whitman using Claude Opus 5
// What a pdf declares about itself, read out of the file's own structure
// — no network, no ocr, no guessing at the prose. Two places hold it and
// real files use both: the Info dictionary the trailer points at (the old
// way: /Title, /Author, /Keywords, /CreationDate) and an XMP packet (the
// current way: Dublin Core and PRISM in rdf/xml, which is where a journal
// puts its doi and a publisher its isbn). XMP wins where both speak,
// because Info predates unicode and producers keep it for compatibility.
//
// Unlike an epub — one zip entry at a fixed offset, and the whole answer
// — a pdf is a graph of numbered objects with its index at the *end*. So
// this reads the source's head and its bounded tail and works over what
// those contain: the trailer, the objects near it, and anything inside an
// object or metadata stream it can inflate. A file that keeps its metadata
// somewhere in the unread middle reports nothing, which is the same
// answer every other derivation gives when it can't see — never an error,
// just less to go on.
//
// The keys are this module's own vocabulary: `title`, `author`,
// `published`, `genre`, `publisher`, `publication`, `doi`, `isbn`,
// `pages`, `description`. Used only for `typeOfPdf`'s ladder — real field
// extraction reads a pdf through `extractor/collectors/pdf.ts` instead,
// which shares nothing with this file. Two readers for one format is a
// real duplication, tolerated here because the two callers need
// genuinely different shapes: this one answers before any schema is
// known, that one fills a basket already shaped for one.
import zlib from "node:zlib";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export const PDF_MIME = "application/pdf";

/** The narrow shape this reader needs — a subset of `ClassificationSource`
 * (trad-classifier.ts) and structurally satisfied by backend's own `Probe`
 * as-is, so nothing here needs to know what opened the file. */
export interface BinarySource {
  head: Buffer;
  size: number;
  tail(): Promise<Buffer>;
}

/**
 * Where the type ladder stops calling a pdf a document and starts calling
 * it a book. Deliberately the *last* rung, under everything the file
 * actually declares, and deliberately high: nothing an article, a memo or
 * a datasheet plausibly reaches, and comfortably under a book or a
 * thesis. It is a guess where the others are readings — which is fine
 * here, because the classifier is a first guess the user overrules, not
 * a fact.
 */
const BOOK_PAGES = 50;

/** A page count past this is a corrupt read, not a book. */
const MAX_PAGES = 500_000;

/** Ceilings on the work a single file can cause: streams opened, and
 * bytes any one of them may expand to. A pdf is an untrusted file from
 * the user's disk, and a zip bomb inside one must cost a bounded amount
 * of memory rather than the process. */
const MAX_STREAMS = 32;
const MAX_INFLATED = 8 * 1024 * 1024;

/** A dict scan runs over inflated object streams, where every `<<` is a
 * candidate; the cap keeps a pathological one from being walked forever. */
const MAX_DICTS = 4096;

/** How many XMP packets are worth considering. A file with more than
 * this many embedded ones has not hidden its own any deeper. */
const MAX_PACKETS = 8;

/** The Info dictionary's own keys, and the ones worth recognising a
 * dictionary by when the trailer that pointed at it was never read. */
const INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "CreationDate", "ModDate"];

// ---------------------------------------------------------------------
// The bytes, as a string
//
// Latin-1 maps every byte to exactly one code unit, so the region reads
// as text — indexes, `indexOf`, regexes — while binary stays recoverable
// byte for byte (`Buffer.from(slice, "latin1")`). Nothing here treats
// the result as prose; text encoding is decided per string, at the point
// one is decoded, which is the only place a pdf says what it used.
// ---------------------------------------------------------------------

/**
 * The parts of the file this reader can see: the head and the tail, or —
 * when the two already meet — the file itself, spliced at the overlap so
 * no byte appears twice and no seam falls inside an object.
 *
 * Kept as separate regions when they don't meet, rather than
 * concatenated: joining them would manufacture a boundary that reads as
 * one continuous stretch of file and could parse across the gap.
 */
async function regionsOf(source: BinarySource): Promise<string[]> {
  const head = source.head;
  const tail = await source.tail();
  if (tail.length === 0) return head.length > 0 ? [head.toString("latin1")] : [];

  const overlap = head.length + tail.length - source.size;
  if (overlap >= 0) {
    const kept = head.subarray(0, Math.max(0, head.length - overlap));
    return [Buffer.concat([kept, tail]).toString("latin1")];
  }
  return [head.toString("latin1"), tail.toString("latin1")];
}

// ---------------------------------------------------------------------
// Object syntax
// ---------------------------------------------------------------------

const WHITESPACE = new Set([" ", "\t", "\r", "\n", "\f", "\0"]);
const DELIMITER = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

/** Everything that is neither whitespace nor a delimiter — what a name,
 * a number or a keyword is made of. */
function isRegular(ch: string | undefined): boolean {
  return ch !== undefined && !WHITESPACE.has(ch) && !DELIMITER.has(ch);
}

function skipSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length) {
    const ch = text[at] as string;
    if (WHITESPACE.has(ch)) {
      at += 1;
    } else if (ch === "%") {
      while (at < text.length && text[at] !== "\n" && text[at] !== "\r") at += 1;
    } else {
      break;
    }
  }
  return at;
}

function endOfToken(text: string, from: number): number {
  let at = from;
  while (isRegular(text[at])) at += 1;
  return at;
}

/** `(a \(nested\) string)` — parens nest, and a backslash escapes the
 * next byte whatever it is. */
function endOfLiteral(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    const ch = text[at];
    if (ch === "\\") {
      at += 1;
    } else if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  return text.length;
}

/** Past the closing `>>`, or -1 when the dictionary runs off the end of
 * the region — which is the ordinary fate of the object a truncated head
 * stops in the middle of, and the reason nothing here trusts a dict it
 * did not see closed. */
function endOfDict(text: string, from: number): number {
  let depth = 0;
  let at = from;
  while (at < text.length) {
    if (text.startsWith("<<", at)) {
      depth += 1;
      at += 2;
    } else if (text.startsWith(">>", at)) {
      depth -= 1;
      at += 2;
      if (depth === 0) return at;
    } else if (text[at] === "(") {
      at = endOfLiteral(text, at);
    } else if (text[at] === "<") {
      const close = text.indexOf(">", at);
      if (close === -1) return -1;
      at = close + 1;
    } else {
      at += 1;
    }
  }
  return -1;
}

function endOfArray(text: string, from: number): number {
  let depth = 0;
  let at = from;
  while (at < text.length) {
    if (text.startsWith("<<", at)) {
      const end = endOfDict(text, at);
      if (end === -1) return -1;
      at = end;
    } else if (text[at] === "(") {
      at = endOfLiteral(text, at);
    } else if (text[at] === "[") {
      depth += 1;
      at += 1;
    } else if (text[at] === "]") {
      depth -= 1;
      at += 1;
      if (depth === 0) return at;
    } else {
      at += 1;
    }
  }
  return -1;
}

/** One value, kept as the raw bytes that spell it — decoding is the
 * caller's, since only the caller knows whether it wanted a string, a
 * date, a number or a reference. */
function readValue(text: string, at: number): { raw: string; end: number } | null {
  const ch = text[at];
  if (ch === undefined) return null;

  if (text.startsWith("<<", at)) {
    const end = endOfDict(text, at);
    return end === -1 ? null : { raw: text.slice(at, end), end };
  }
  if (ch === "(") {
    const end = endOfLiteral(text, at);
    return { raw: text.slice(at, end), end };
  }
  if (ch === "<") {
    const close = text.indexOf(">", at);
    return close === -1 ? null : { raw: text.slice(at, close + 1), end: close + 1 };
  }
  if (ch === "[") {
    const end = endOfArray(text, at);
    return end === -1 ? null : { raw: text.slice(at, end), end };
  }
  if (ch === "/") {
    const end = endOfToken(text, at + 1);
    return { raw: text.slice(at, end), end };
  }

  const end = endOfToken(text, at);
  if (end === at) return null;

  // `12 0 R` is three tokens and one value. Read as one, so a dictionary
  // holding a reference doesn't look like it holds the number 12.
  if (/^\d+$/.test(text.slice(at, end))) {
    const reference = /^\s+\d+\s+R\b/.exec(text.slice(end, end + 32));
    if (reference) return { raw: text.slice(at, end + reference[0].length), end: end + reference[0].length };
  }
  return { raw: text.slice(at, end), end };
}

type Dict = Record<string, string>;

/** `<< /Key value … >>` starting at `from`. A dictionary that ends early
 * or turns to nonsense keeps the pairs read so far: half a trailer still
 * names the Info object, and a file this reader can only half see is the
 * case it exists to survive. */
function parseDict(text: string, from: number): Dict | null {
  if (!text.startsWith("<<", from)) return null;
  const dict: Dict = {};
  let at = from + 2;

  for (;;) {
    at = skipSpace(text, at);
    if (at >= text.length || text.startsWith(">>", at)) return dict;
    if (text[at] !== "/") return dict;

    const keyEnd = endOfToken(text, at + 1);
    const key = decodeName(text.slice(at + 1, keyEnd));
    const value = readValue(text, skipSpace(text, keyEnd));
    if (!value) return dict;

    dict[key] = value.raw;
    at = value.end;
  }
}

/** `#20` is a space: how a name carries a byte its syntax forbids. */
function decodeName(raw: string): string {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

// ---------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------

function unescapeLiteral(body: string): Buffer {
  const bytes: number[] = [];
  const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };

  for (let at = 0; at < body.length; at += 1) {
    const ch = body[at] as string;
    if (ch !== "\\") {
      bytes.push(ch.charCodeAt(0));
      continue;
    }

    const next = body[at + 1];
    if (next === undefined) break;
    at += 1;

    if (next in ESCAPES) {
      bytes.push(ESCAPES[next] as number);
    } else if (next === "\n") {
      continue; // a line the writer broke, not a character
    } else if (next === "\r") {
      if (body[at + 1] === "\n") at += 1;
    } else if (next >= "0" && next <= "7") {
      let octal = next;
      let peek = body[at + 1];
      while (octal.length < 3 && peek !== undefined && peek >= "0" && peek <= "7") {
        octal += peek;
        at += 1;
        peek = body[at + 1];
      }
      bytes.push(Number.parseInt(octal, 8) & 0xff);
    } else {
      bytes.push(next.charCodeAt(0));
    }
  }
  return Buffer.from(bytes);
}

/**
 * A pdf string says its encoding by its first two bytes: a UTF-16 byte
 * order mark, or else PDFDocEncoding — which is latin-1 over everything
 * a title is likely to use. The utf-8 check in between is not in the
 * spec and is there anyway: producers write it, and reading `Ω` as `Î©`
 * is a visible wrong answer where the check costs a comparison.
 */
function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2, 2 + (((bytes.length - 2) / 2) | 0) * 2);
    return Buffer.from(body).swap16().toString("utf16le");
  }
  const utf8 = bytes.toString("utf8");
  if (Buffer.from(utf8, "utf8").equals(bytes)) return utf8;
  return bytes.toString("latin1");
}

/** The text a raw value spells, for the two shapes a pdf writes text in.
 * Anything else — a name, a number, a reference — is not a string and is
 * reported as none rather than as its own spelling. */
function asText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;

  let text: string | undefined;
  if (raw.startsWith("(")) {
    text = decodeText(unescapeLiteral(raw.slice(1, -1)));
  } else if (raw.startsWith("<") && !raw.startsWith("<<")) {
    const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, "");
    text = decodeText(Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex"));
  }

  const trimmed = text?.replace(/\0/g, "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function asNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[-+]?\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** `/Pages` from a `/Type` value, whatever spacing was written. */
function nameOf(raw: string | undefined): string | undefined {
  return raw?.startsWith("/") ? raw.slice(1) : undefined;
}

/**
 * `D:19650801120000-05'00'` (Info) and `1965-08-01T12:00:00Z` (XMP) are
 * the same date said twice; both become the plain date the predicate
 * grammar can compare, and anything unparseable is kept as written.
 */
function asDate(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return value.slice(0, 10);

  const pdf = /^D?:?\s*(\d{4})(\d{2})?(\d{2})?/.exec(value);
  if (pdf) return `${pdf[1]}-${pdf[2] ?? "01"}-${pdf[3] ?? "01"}`;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

/** Keywords are one string holding several things, unlike Dublin Core's
 * repeated elements — comma, semicolon or newline, whichever the writer
 * chose. */
function split(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}

// ---------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------

interface PdfObject {
  dict: Dict;
  /** The raw, still-encoded stream body, when the object has one. */
  stream?: string;
}

const OBJECT_HEADER = /(\d+)\s+\d+\s+obj\b/g;

/** The stream that follows a dictionary, taken to `endstream` rather than
 * by the dictionary's `/Length` — which is frequently an indirect
 * reference to an object this reader may never have seen. */
function streamAfter(text: string, dictEnd: number): string | undefined {
  if (dictEnd === -1) return undefined;
  let at = skipSpace(text, dictEnd);
  if (!text.startsWith("stream", at)) return undefined;

  at += "stream".length;
  if (text[at] === "\r") at += 1;
  if (text[at] === "\n") at += 1;

  const close = text.indexOf("endstream", at);
  return close === -1 ? undefined : text.slice(at, close);
}

function scanObjects(text: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();

  for (const match of text.matchAll(OBJECT_HEADER)) {
    const after = (match.index ?? 0) + match[0].length;
    const open = text.indexOf("<<", after);
    // Nothing but whitespace may sit between `obj` and its dictionary;
    // otherwise this object holds something else and the `<<` found
    // belongs to a later one.
    if (open === -1 || text.slice(after, open).trim() !== "") continue;

    const dict = parseDict(text, open);
    if (!dict) continue;

    const stream = streamAfter(text, endOfDict(text, open));
    // Later definitions win: an incrementally updated file restates an
    // object rather than editing it in place, and the last one is current.
    objects.set(Number(match[1]), stream === undefined ? { dict } : { dict, stream });
  }
  return objects;
}

function scanTrailers(text: string): Dict[] {
  const dicts: Dict[] = [];
  for (const match of text.matchAll(/trailer\b/g)) {
    const at = skipSpace(text, (match.index ?? 0) + "trailer".length);
    const dict = parseDict(text, at);
    if (dict) dicts.push(dict);
  }
  return dicts;
}

/** Every dictionary in a stretch of text, for the one place they arrive
 * without `obj` headers around them: the inside of an object stream. */
function scanDicts(text: string): Dict[] {
  const dicts: Dict[] = [];
  let at = text.indexOf("<<");
  while (at !== -1 && dicts.length < MAX_DICTS) {
    const dict = parseDict(text, at);
    if (dict) dicts.push(dict);
    at = text.indexOf("<<", at + 2);
  }
  return dicts;
}

/**
 * A stream's bytes, inflated when they are deflated — the only filter
 * worth implementing, because it is the only one the three streams this
 * reader opens (object, metadata, cross-reference) are written with in
 * practice. Bounded output, and a failure is simply nothing: a stream
 * whose bytes were cut off by the region boundary is the common case,
 * not an exception.
 */
function decoded(object: PdfObject): string | null {
  const raw = object.stream;
  if (raw === undefined) return null;
  if (!(object.dict.Filter ?? "").includes("FlateDecode")) return raw;

  const bytes = Buffer.from(raw.replace(/[\r\n]+$/, ""), "latin1");
  for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      return inflate(bytes, { maxOutputLength: MAX_INFLATED }).toString("latin1");
    } catch {
      // Not this framing, or too big to be worth holding. Try the other.
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// XMP
// ---------------------------------------------------------------------

function localName(tag: string): string {
  const at = tag.indexOf(":");
  return (at === -1 ? tag : tag.slice(at + 1)).toLowerCase();
}

/**
 * The prefixes that spell rdf/xml's own scaffolding rather than anything
 * a document said about itself. Ignoring the namespace and matching on
 * the local name — which is what makes prefix-insensitivity work at all
 * — puts `rdf:Description`, the element every property is *wrapped in*,
 * one name away from `dc:description`. Read as a property it returns the
 * whole packet's text: a book came back described as
 * "2024-12-05T20:25:57+05:30 LaTeX …", its own timestamps and toolchain.
 */
const STRUCTURAL = new Set(["rdf", "x", "xml", "xmlns"]);

function isProperty(name: string): boolean {
  const at = name.indexOf(":");
  return at === -1 ? name !== "xmlns" : !STRUCTURAL.has(name.slice(0, at).toLowerCase());
}

type Packet = ReturnType<typeof cheerio.load>;

/**
 * Every value XMP holds under a property name, namespace prefix ignored
 * — files are not consistent about it.
 *
 * Both spellings, because both are ordinary: a property can be an
 * element wrapping an `rdf:Alt`/`rdf:Seq`/`rdf:Bag` of `rdf:li`s, or an
 * attribute on an `rdf:Description` — and a packet routinely uses one
 * for the title and the other for the date.
 */
function xmpValues($: Packet, name: string): string[] {
  const values: string[] = [];

  for (const el of $("*").toArray() as Element[]) {
    for (const [attribute, value] of Object.entries(el.attribs ?? {})) {
      if (isProperty(attribute) && localName(attribute) === name) values.push(String(value).trim());
    }
    if (!isProperty(el.tagName) || localName(el.tagName) !== name) continue;

    const items = $(el)
      .find("*")
      .filter((_index, kid: Element) => localName(kid.tagName) === "li")
      .toArray();
    if (items.length > 0) values.push(...items.map((li) => $(li).text().trim()));
    else values.push($(el).text().trim());
  }

  return unique(values);
}

const XMP_START = "<x:xmpmeta";
const XMP_END = "</x:xmpmeta>";

/** However many complete packets a stretch of text holds, in the order
 * they were written. */
function packetsIn(text: string): string[] {
  const packets: string[] = [];
  let at = text.indexOf(XMP_START);
  while (at !== -1 && packets.length < MAX_PACKETS) {
    const end = text.indexOf(XMP_END, at);
    if (end === -1) break;
    packets.push(text.slice(at, end + XMP_END.length));
    at = text.indexOf(XMP_START, end);
  }
  return packets;
}

/**
 * Not every XMP packet inside a pdf is the pdf's. An embedded
 * illustration carries its own, and producers write those *first*: the
 * paper this reader was built against declares
 * `CROSSMARK_BW_txt_100x100.eps` a hundred kilobytes before it declares
 * its own title, and taking the first packet found titled the article
 * after the publisher's logo.
 *
 * A packet that names a media type settles it — the logo says
 * `application/postscript` — and one that names none is taken at its
 * word, since a document packet often omits `dc:format` entirely.
 */
function isDocumentPacket($: Packet): boolean {
  const format = xmpValues($, "format")[0];
  return format === undefined || format.includes("pdf");
}

/** The first packet that is plausibly the document's own, already
 * parsed — candidates arrive in order of authority, so the catalog's
 * declared metadata is tried before anything merely found lying in the
 * file. */
function documentPacket(packets: string[]): Packet | null {
  for (const packet of packets.slice(0, MAX_PACKETS)) {
    // XMP is xml and so is utf-8 (or utf-16) whatever the bytes around
    // it were; the region it was cut out of is neither.
    const $ = cheerio.load(decodeText(Buffer.from(packet, "latin1")), { xmlMode: true });
    if (isDocumentPacket($)) return $;
  }
  return null;
}

// ---------------------------------------------------------------------
// What the file said
// ---------------------------------------------------------------------

export interface PdfMetadata {
  title?: string;
  authors: string[];
  published?: string;
  subjects: string[];
  publisher?: string;
  /** The journal, magazine or site an article appeared in (PRISM's
   * `publicationName`) — the thing that makes it an article rather than
   * a document. */
  publication?: string;
  doi?: string;
  isbn?: string;
  pages?: number;
  description?: string;
}

const NOTHING: PdfMetadata = { authors: [], subjects: [] };

const DOI = /\b10\.\d{4,9}\/\S+/;

function isbnIn(values: string[]): string | undefined {
  for (const value of values) {
    const digits = value.replace(/[^0-9Xx]/g, "");
    if (digits.length === 10 || digits.length === 13) return digits;
  }
  return undefined;
}

function doiIn(values: string[]): string | undefined {
  for (const value of values) {
    const found = DOI.exec(value);
    if (found) return found[0];
  }
  return undefined;
}

/** The object number a `12 0 R` value points at. */
function referenceIn(raw: string | undefined): number | undefined {
  const reference = /^(\d+)\s+\d+\s+R$/.exec(raw ?? "");
  return reference ? Number(reference[1]) : undefined;
}

/** The dictionary the trailer calls `/Info`, or — when the trailer that
 * named it fell outside the regions read — one that is unmistakably an
 * Info dictionary on its own terms: it carries Info's keys and, unlike
 * every other dictionary in a pdf, declares no `/Type`. */
function infoIn(objects: Map<number, PdfObject>, dicts: Dict[]): Dict | undefined {
  let found: Dict | undefined;

  for (const dict of dicts) {
    const target = objects.get(referenceIn(dict.Info) ?? -1)?.dict;
    if (target) found = target;
  }
  if (found) return found;

  return dicts
    .filter((dict) => dict.Type === undefined && INFO_KEYS.some((key) => key in dict))
    .at(-1);
}

/** The root of the page tree holds the total; every other node holds a
 * subtree's, so the largest count seen is the document's length. */
function pagesIn(dicts: Dict[]): number | undefined {
  let most: number | undefined;
  for (const dict of dicts) {
    if (nameOf(dict.Type) !== "Pages") continue;
    const count = asNumber(dict.Count);
    if (count !== undefined && count > 0 && count <= MAX_PAGES && (most === undefined || count > most)) {
      most = count;
    }
  }
  return most;
}

function fromInfo(info: Dict | undefined, metadata: PdfMetadata): void {
  if (!info) return;

  metadata.title ??= asText(info.Title);
  // One string that may hold several names, and only `;` separates them
  // unambiguously — a comma is as likely to be "Herbert, Frank".
  if (metadata.authors.length === 0) {
    const author = asText(info.Author);
    metadata.authors = author ? author.split(";").map((name) => name.trim()).filter(Boolean) : [];
  }
  metadata.published ??= asDate(asText(info.CreationDate));
  if (metadata.subjects.length === 0) metadata.subjects = split(asText(info.Keywords));

  // Info's `/Subject` is the document's *about*, not a category: a
  // preprint puts its whole abstract there. It reads as a description
  // and is reported as one.
  metadata.description ??= asText(info.Subject);
}

function fromXmp($: Packet, metadata: PdfMetadata): void {
  const first = (name: string) => xmpValues($, name)[0];

  metadata.title ??= first("title");
  if (metadata.authors.length === 0) metadata.authors = xmpValues($, "creator");
  metadata.published ??= asDate(first("createdate") ?? first("date"));
  metadata.publisher ??= first("publisher");
  metadata.publication ??= first("publicationname");
  metadata.description ??= first("description");

  const subjects = [...xmpValues($, "subject"), ...split(first("keywords"))];
  if (metadata.subjects.length === 0) metadata.subjects = unique(subjects);

  const identifiers = [
    ...xmpValues($, "identifier"),
    ...xmpValues($, "isbn"),
    ...xmpValues($, "doi"),
    ...xmpValues($, "source"),
  ];
  metadata.isbn ??= isbnIn(identifiers);
  metadata.doi ??= doiIn(identifiers);
}

/**
 * The regions, read for everything they turn out to contain. Streams are
 * inflated only where the dictionary in front of them says it is one of
 * the two that can hold metadata — an object stream hiding the Info
 * dictionary, a metadata stream holding the XMP packet — so a page of
 * typeset text is never expanded to be looked at. A cross-reference
 * stream needs no inflating: what this reader wants from it, the `/Info`
 * reference, is in its dictionary, and the dictionary is plain.
 */
async function read(source: BinarySource): Promise<PdfMetadata> {
  const metadata: PdfMetadata = { authors: [], subjects: [] };
  const objects = new Map<number, PdfObject>();
  const dicts: Dict[] = [];
  const loose: string[] = [];

  for (const region of await regionsOf(source)) {
    for (const [number, object] of scanObjects(region)) objects.set(number, object);
    dicts.push(...scanTrailers(region));
    loose.push(...packetsIn(region));
  }
  dicts.push(...[...objects.values()].map((object) => object.dict));

  // Which metadata stream is the *document's* is a thing the catalog
  // states, and only it does; everything else found is a candidate.
  const catalog = dicts.find((dict) => nameOf(dict.Type) === "Catalog");
  const declared = referenceIn(catalog?.Metadata);

  const streams: string[] = [];
  let opened = 0;
  for (const [number, object] of objects) {
    if (opened >= MAX_STREAMS) break;
    const type = nameOf(object.dict.Type);
    if (type !== "ObjStm" && type !== "Metadata") continue;

    const content = decoded(object);
    if (content === null) continue;
    opened += 1;

    if (type === "ObjStm") {
      dicts.push(...scanDicts(content));
      continue;
    }
    for (const packet of packetsIn(content)) {
      if (number === declared) streams.unshift(packet);
      else streams.push(packet);
    }
  }

  const packet = documentPacket([...streams, ...loose]);
  if (packet) fromXmp(packet, metadata);
  fromInfo(infoIn(objects, dicts), metadata);
  metadata.pages = pagesIn(dicts);

  return metadata;
}

const READINGS = new WeakMap<BinarySource, Promise<PdfMetadata>>();

/**
 * What this pdf says about itself, read once per source: classification
 * asks first to decide what kind of thing the file is, extraction asks
 * second for the same answer's contents, and a source is a handle that
 * opens its resource once. Never rejects — an unreadable pdf reports
 * nothing, the way an unreadable epub does.
 */
export function readPdf(source: BinarySource): Promise<PdfMetadata> {
  const reading = READINGS.get(source);
  if (reading) return reading;

  const started = read(source).catch(() => NOTHING);
  READINGS.set(source, started);
  return started;
}

/**
 * Which kind of document a pdf is — the ladder trad-classifier.ts hands
 * the pdf rung to, first match winning as everywhere else.
 *
 * A pdf is the one format that is genuinely several kinds of thing: the
 * same bytes carry a novel, a paper and a receipt, and the extension
 * says nothing about which. So the ladder asks what the file declared —
 * a journal or a doi is a paper saying so; an isbn is a published book
 * saying so — and only then falls back on length.
 *
 * Unlike every other rung in the classifier, this one always answers.
 * `document` is not a guess about the contents but a statement of what a
 * pdf is, and it is worth making: it gives the item a type, its type a
 * schema to grow, and the extracted title somewhere to land.
 */
export function typeOfPdf(metadata: PdfMetadata): string {
  if (metadata.doi || metadata.publication) return "article";
  if (metadata.isbn) return "book";
  if (metadata.pages !== undefined && metadata.pages >= BOOK_PAGES) return "book";
  return "document";
}
