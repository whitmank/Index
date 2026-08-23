// Authored by Karter Whitman using Claude Opus 5
// Everything a PDF says about itself, from the two places it keeps it.
//
// A PDF's index is at the *end* — the trailer is the last thing written
// and everything the document declares hangs off it — so the regions read
// here are the head and the tail, both bounded. That is what lets an
// 80 MB scan be read for its metadata at a fixed cost.
//
// The two places are the **Info dictionary**, which the trailer points
// at, and the **XMP packet**, which the catalog names. Both are collected
// in full and both are labelled; which one to believe where they differ
// is a judgement, and judgements are made downstream now. The one thing
// this file still refuses to do is read the *wrong* packet — an embedded
// logo's XMP is written ahead of the document's in real files, and
// walking the catalog rather than scanning is what keeps a book from
// being titled after its cover art (pdf-xmp.ts has that story).
import { add, type BasketEntry } from "../evidence/basket.js";
import { PDF_MIME } from "../evidence/read-source.js";
import type { SourceEvidence } from "../evidence/source-evidence.js";
import { findIsbn } from "../../contracts/normalize-identifiers.js";
import type { Collector } from "./collector.js";
import {
  asRef,
  asText,
  decodeStream,
  nameOf,
  scanObjects,
  scanTrailers,
  type Dict,
  type PdfObject,
} from "./pdf-syntax.js";
import { bestPacket, parseXmpPacket, type XmpValues } from "./pdf-xmp.js";

export { PDF_MIME };

interface Regions {
  text: string;
  objects: Map<number, PdfObject>;
}

/** Head and tail joined by a marker that cannot appear inside an object,
 * so a structure spanning the gap is never read as continuous. */
async function regionsOf(source: SourceEvidence): Promise<Regions> {
  const head = source.head.toString("latin1");
  const tail = source.truncated ? (await source.tail()).toString("latin1") : "";
  const text = tail === "" ? head : `${head}\n%%GAP%%\n${tail}`;
  return { text, objects: scanObjects(text) };
}

async function wholeFile(source: SourceEvidence): Promise<Regions | null> {
  const bytes = await source.bytes();
  if (!bytes) return null;
  const text = bytes.toString("latin1");
  return { text, objects: scanObjects(text) };
}

/**
 * The trailer's dictionary, in whichever of its two forms this file uses.
 *
 * PDF 1.5 replaced the `trailer` keyword with a cross-reference *stream*,
 * whose dictionary carries the same `/Root` and `/Info`. A reader knowing
 * only the keyword finds nothing in any file written by a producer that
 * adopted it, which is most of them.
 */
function trailerOf(regions: Regions): Dict | null {
  const keyword = scanTrailers(regions.text);
  const withInfo = keyword.find((dict) => dict["Info"] ?? dict["Root"]);
  if (withInfo) return withInfo;

  for (const object of regions.objects.values()) {
    if (nameOf(object.dict["Type"]) === "XRef") return object.dict;
  }
  return null;
}

function resolveInfo(regions: Regions): Dict | null {
  const trailer = trailerOf(regions);
  const ref = asRef(trailer?.["Info"]);
  const object = ref === undefined ? undefined : regions.objects.get(ref);
  if (object && Object.keys(object.dict).length > 0) return object.dict;

  // No usable reference: an Info dictionary is recognisable on its own —
  // the object carrying these keys and no `/Type`.
  for (const candidate of regions.objects.values()) {
    if (candidate.dict["Type"]) continue;
    if (candidate.dict["Title"] ?? candidate.dict["Author"] ?? candidate.dict["Producer"]) {
      return candidate.dict;
    }
  }
  return null;
}

function resolveXmp(regions: Regions): XmpValues | null {
  const trailer = trailerOf(regions);
  const rootRef = asRef(trailer?.["Root"]);
  const root = rootRef === undefined ? undefined : regions.objects.get(rootRef);
  const catalog =
    root ??
    [...regions.objects.values()].find((object) => nameOf(object.dict["Type"]) === "Catalog");

  const metadataRef = asRef(catalog?.dict["Metadata"]);
  const metadata = metadataRef === undefined ? undefined : regions.objects.get(metadataRef);
  const declared = metadata ? decodeStream(regions.text, metadata) : null;

  if (declared) {
    try {
      const values = parseXmpPacket(declared);
      if (Object.keys(values).length > 0) return values;
    } catch {
      // Fall through to the ranked scan.
    }
  }
  return bestPacket(regions.text);
}

/** Producer boilerplate that occupies the Title field. Dropped rather
 * than collected: these are not competing claims about the title, they
 * are the absence of one, and leaving them in invites the model to
 * dutifully report `untitled` as a book's name. */
const JUNK_TITLE = /^(untitled|document\d*|microsoft word - .*|print|scan(ned)?( document)?\d*)$/i;

/** Info keys worth carrying. The exception to collecting everything, and
 * a narrow one: the rest of an Info dictionary is `/Producer`,
 * `/Creator`, `/ModDate` and custom tool keys, which say a great deal
 * about the software and nothing about the work. */
const INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "CreationDate"];

/**
 * XMP properties that describe **the file, or the software that made
 * it** — never the work inside it.
 *
 * Dropped rather than collected, and this is the sharpest lesson the
 * corpus taught. Collecting everything is right for *content*, but a
 * PDF's packet is half tool exhaust, and a model reading the whole basket
 * will happily answer "publisher" with the nearest plausible
 * organisation-shaped string. Measured over 25 real books that produced
 * `publisher: Antenna House PDF Output Library` and
 * `publisher: Adobe InDesign CS6` — values that pass grounding, because
 * they genuinely *are* in the evidence.
 *
 * Grounding stops a value coming from outside the evidence. Only leaving
 * a fact out stops one coming from the wrong part of it.
 */
const ABOUT_THE_TOOL = new Set([
  "pdf:producer",
  "pdf:pdfversion",
  "pdf:trapped",
  "xmp:creatortool",
  "xmp:metadatadate",
  "xmp:modifydate",
  // The media type. It reached the basket and came back out as
  // `subject: application/pdf`.
  "dc:format",
]);

/** Whole namespaces about provenance-of-the-file, image capture, or an
 * editor's internal state. None of them can say anything about a work. */
const TOOL_NAMESPACES = new Set([
  "xmpmm",
  "stevt",
  "stref",
  "tiff",
  "exif",
  "crs",
  "aux",
  "illustrator",
  "xmptpg",
  "pdfx",
  "photoshop",
]);

function aboutTheWork(property: string): boolean {
  const lower = property.toLowerCase();
  if (ABOUT_THE_TOOL.has(lower)) return false;
  return !TOOL_NAMESPACES.has(lower.split(":")[0] ?? "");
}

export const pdfCollector: Collector = {
  name: "pdf",

  handles(source: SourceEvidence): boolean {
    return source.mime === PDF_MIME;
  },

  async collect(source: SourceEvidence, basket: BasketEntry[]): Promise<void> {
    let regions = await regionsOf(source);
    let info = resolveInfo(regions);
    let xmp = resolveXmp(regions);

    // The bounded regions missed something the file may still hold. One
    // full read rather than silently reporting an empty document.
    if ((!info || !xmp) && source.truncated) {
      const whole = await wholeFile(source);
      if (whole) {
        regions = whole;
        info = info ?? resolveInfo(regions);
        xmp = xmp ?? resolveXmp(regions);
      }
    }

    const identifierText: string[] = [];

    for (const key of INFO_KEYS) {
      const text = asText(info?.[key]);
      if (!text) continue;
      if (key === "Title" && JUNK_TITLE.test(text.trim())) continue;
      add(basket, `pdf.Info.${key}`, text, source.sourceId);
      identifierText.push(text);
    }

    // Every XMP property *about the work*, under its qualified name.
    // Qualified because `rdf:Description` is one local name away from
    // `dc:description`, and collapsing them puts the whole packet's text
    // where a summary goes.
    for (const [property, values] of Object.entries(xmp ?? {})) {
      if (!aboutTheWork(property)) continue;
      for (const value of values) {
        if (property === "dc:title" && JUNK_TITLE.test(value.trim())) continue;
        add(basket, `pdf.xmp.${property}`, value, source.sourceId);
        identifierText.push(value);
      }
    }

    for (const text of identifierText) {
      const isbn = findIsbn(text);
      if (isbn) {
        add(basket, "verified_isbn13", isbn, source.sourceId);
        break;
      }
    }
  },
};
