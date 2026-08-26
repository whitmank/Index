// Authored by Karter Whitman using Claude Opus 5
// XMP: the modern half of what a PDF says about itself.
//
// Two traps live in this file, and both are the kind that pass every
// synthetic fixture and fail on real books.
//
// **The wrong packet.** A PDF can contain many XMP packets, because every
// embedded image may carry its own — and an embedded logo's packet is
// commonly written *ahead* of the document's. Taking the first
// `<x:xmpmeta>` found therefore titles the book after a piece of cover
// art. So the packet is located properly, by walking the catalog's
// `/Metadata` reference, and only falls back to scanning when that fails.
//
// **`rdf:Description` is one local name away from `dc:description`.** A
// parser matching on local names — which is the natural way to cope with
// XMP's namespace prefixes being arbitrary — reads the RDF container
// element itself as the document's description, and gets a blob of the
// whole packet's text where a summary should be. Every property match
// here is on the *qualified* name for that reason.
import * as cheerio from "cheerio";

/** Prefixes that are structure rather than content. `rdf` is the one
 * that matters; the rest are here so a stray `x:xmpmeta` attribute is
 * never mistaken for a property. */
const STRUCTURAL = new Set(["rdf", "x", "xml", "xmlns"]);

export type XmpValues = Record<string, string[]>;

function qualifiedName(tag: string): { prefix: string; local: string } {
  const at = tag.indexOf(":");
  if (at === -1) return { prefix: "", local: tag.toLowerCase() };
  return { prefix: tag.slice(0, at).toLowerCase(), local: tag.slice(at + 1).toLowerCase() };
}

/** Cheerio 1.x no longer re-exports its node types, so the wrapped
 * selection is named through the API's own return type rather than by
 * reaching into the parser's package for a name that may move again. */
type Selection = ReturnType<cheerio.CheerioAPI>;

/**
 * An XMP value is either a plain text node or an RDF container —
 * `rdf:Alt` for a language-alternative title, `rdf:Seq` for an ordered
 * list of authors, `rdf:Bag` for an unordered set of subjects. Every one
 * of them holds its values in `rdf:li` children.
 */
function valuesOf(selection: Selection): string[] {
  const items: string[] = [];
  selection.find("*").each((_, child) => {
    if (!("tagName" in child) || qualifiedName(child.tagName).local !== "li") return;
    items.push(childText(child));
  });

  const kept = items.filter((text) => text !== "");
  if (kept.length > 0) return kept;
  const text = selection.text().trim();
  return text === "" ? [] : [text];
}

/** The text of a node, walked directly — cheerio's own `.text()` needs a
 * wrapped selection, and wrapping each child just to read it is a parse
 * per item. */
function childText(node: unknown): string {
  const walk = (current: unknown): string => {
    const entry = current as { type?: string; data?: string; children?: unknown[] };
    if (entry.type === "text") return entry.data ?? "";
    return (entry.children ?? []).map(walk).join("");
  };
  return walk(node).trim();
}

/**
 * Every property in a packet, keyed by its qualified name — `dc:title`,
 * `pdf:Keywords`, `xmp:CreateDate`.
 *
 * Properties appear two ways and real files use both, sometimes in the
 * same packet: as child elements of `rdf:Description`, and as attributes
 * on it (the "shorthand" form). Reading only the first silently loses
 * every field of a file written by a producer that prefers the second.
 */
export function parseXmpPacket(xml: string): XmpValues {
  const values: XmpValues = {};
  const $ = cheerio.load(xml, { xml: true });

  const add = (name: string, found: string[]) => {
    if (found.length === 0) return;
    values[name] = [...(values[name] ?? []), ...found];
  };

  $("*").each((_, element) => {
    if (!("tagName" in element)) return;
    const { prefix, local } = qualifiedName(element.tagName);

    // The container element itself, whose attributes are the shorthand
    // properties. Its *text* is the whole packet and must never be read
    // as a value — this is the `rdf:Description` trap.
    if (prefix === "rdf" && local === "description") {
      for (const [attribute, value] of Object.entries(element.attribs ?? {})) {
        const attributeName = qualifiedName(attribute);
        if (STRUCTURAL.has(attributeName.prefix) || attributeName.prefix === "") continue;
        const text = String(value).trim();
        if (text !== "") add(`${attributeName.prefix}:${attributeName.local}`, [text]);
      }
      return;
    }

    if (STRUCTURAL.has(prefix) || prefix === "") return;
    add(`${prefix}:${local}`, valuesOf($(element)));
  });

  return values;
}

const PACKET_START = "<x:xmpmeta";
const PACKET_END = "</x:xmpmeta>";
const MAX_PACKETS = 8;

/** Every XMP packet in a region, in the order they appear. */
export function findPackets(text: string): string[] {
  const packets: string[] = [];
  let at = text.indexOf(PACKET_START);
  while (at !== -1 && packets.length < MAX_PACKETS) {
    const end = text.indexOf(PACKET_END, at);
    if (end === -1) break;
    packets.push(text.slice(at, end + PACKET_END.length));
    at = text.indexOf(PACKET_START, end);
  }
  return packets;
}

/** Properties that only a *document's* packet would carry. An embedded
 * image's XMP is about the image: it has dimensions, a colour profile and
 * a camera, and it does not have a publisher or an isbn. */
const DOCUMENT_PROPERTIES = ["dc:publisher", "dc:identifier", "pdf:Keywords", "dc:description"];

/** Properties that mark a packet as being about an *image*, whatever
 * else it says. A logo's packet routinely carries `dc:title`, so a
 * positive signal is not enough on its own — this is the negative one. */
const IMAGE_PROPERTIES = ["tiff:ImageWidth", "exif:PixelXDimension", "tiff:Make", "exif:ExifVersion"];

function score(values: XmpValues): number {
  if (IMAGE_PROPERTIES.some((property) => property in values)) return -1;
  const documentish = DOCUMENT_PROPERTIES.filter((property) => property in values).length;
  const titled = "dc:title" in values || "dc:creator" in values ? 1 : 0;
  return documentish * 2 + titled;
}

/**
 * The document's own packet out of a region full of them — the fallback
 * for when the catalog could not be walked.
 *
 * Ranked rather than positional. "First" is wrong (a logo's packet
 * precedes the document's), and "last" is wrong just as often; what
 * separates them is what they contain, so that is what is asked.
 */
export function bestPacket(text: string): XmpValues | null {
  const parsed = findPackets(text)
    .map((packet) => {
      try {
        return parseXmpPacket(packet);
      } catch {
        return null;
      }
    })
    .filter((values): values is XmpValues => values !== null && Object.keys(values).length > 0);

  let best: XmpValues | null = null;
  let bestScore = 0;
  for (const values of parsed) {
    const rank = score(values);
    if (rank > bestScore) {
      best = values;
      bestScore = rank;
    }
  }
  return best;
}
