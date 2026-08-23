// Authored by Karter Whitman using Claude Opus 5
// Everything an epub's package document declares.
//
// The whole metadata block, not a chosen subset. An earlier version kept
// a list of the seven Dublin Core elements it had thought about and
// dropped the rest, which meant a book stating its series, its
// contributors or its edition had that thrown away before anything could
// use it. Collecting costs one line per element; deciding what matters is
// somebody else's job now.
import * as cheerio from "cheerio";
import JSZip from "jszip";
import { add, type BasketEntry } from "../evidence/basket.js";
import { EPUB_MIME } from "../evidence/read-source.js";
import type { SourceEvidence } from "../evidence/source-evidence.js";
import { findIsbn } from "../../contracts/normalize-identifiers.js";
import type { Collector } from "./collector.js";

const CONTAINER_PATH = "META-INF/container.xml";

/** Namespaced tags reach cheerio as their whole name, and a package
 * document may or may not carry the prefix. */
function localName(tag: string): string {
  const at = tag.indexOf(":");
  return (at === -1 ? tag : tag.slice(at + 1)).toLowerCase();
}

/**
 * The package document's path, which the container names. Read rather
 * than assumed: `OEBPS/content.opf` is a convention plenty of real books
 * do not follow, and guessing it fails silently on those.
 */
function opfPathFrom(containerXml: string): string | null {
  const $ = cheerio.load(containerXml, { xml: true });
  const path = $("rootfile").attr("full-path");
  return path && path.trim() !== "" ? path.trim() : null;
}

export const epubCollector: Collector = {
  name: "epub",

  handles(source: SourceEvidence): boolean {
    return source.mime === EPUB_MIME;
  },

  async collect(source: SourceEvidence, basket: BasketEntry[]): Promise<void> {
    const bytes = await source.bytes();
    if (!bytes) return;

    const zip = await JSZip.loadAsync(bytes);
    const container = await zip.file(CONTAINER_PATH)?.async("string");
    if (!container) return;

    const opfPath = opfPathFrom(container);
    const opf = opfPath ? await zip.file(opfPath)?.async("string") : undefined;
    if (!opf) return;

    const $ = cheerio.load(opf, { xml: true });
    // A package document always has a <metadata> block; scoping to it
    // when present keeps the manifest's hundreds of file entries out of
    // the basket. Falling back to the whole document handles the
    // malformed ones rather than reporting them as empty.
    const metadata = $("metadata");
    const scope = metadata.length > 0 ? metadata.find("*") : $("*");

    // Every element inside <metadata>, under the name the file used.
    scope.each((_, element) => {
      if (!("tagName" in element)) return;
      const name = localName(element.tagName);
      const text = $(element).text().trim();

      // `<meta>` carries its meaning in attributes rather than its tag —
      // `<meta property="dcterms:modified">` or the older
      // `<meta name="calibre:series" content="…">`.
      if (name === "meta") {
        const property = element.attribs?.["property"] ?? element.attribs?.["name"];
        const content = element.attribs?.["content"] ?? text;
        if (property && content) add(basket, `opf.${property}`, content, source.sourceId);
        return;
      }
      add(basket, `opf.dc:${name}`, text, source.sourceId);
    });

    // An identifier that verifies as an ISBN is stated as one. This is
    // arithmetic, not interpretation: a book routinely declares a uuid, a
    // url and an isbn side by side, and the checksum is the only thing
    // that tells them apart. Handing the model the verified answer keeps
    // it from having to guess which number is which.
    const identifiers: string[] = [];
    scope.each((_, element) => {
      if ("tagName" in element && localName(element.tagName) === "identifier") {
        identifiers.push($(element).text().trim());
      }
    });
    for (const identifier of identifiers) {
      const isbn = findIsbn(identifier.replace(/^\s*(urn:)?isbn[:\s-]*/i, ""));
      if (isbn) {
        add(basket, "verified_isbn13", isbn, source.sourceId);
        break;
      }
    }
  },
};
