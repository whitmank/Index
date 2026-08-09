// Authored by Karter Whitman using Claude Sonnet 5
// Book metadata, read straight from the epub's own OPF package document
// (container.xml points at it; Dublin Core elements hold the rest) — no
// network, no guessing beyond what the file already declares.
//
// Field names here are a v1 convention (title/author/published/genre/
// isbn), not something read off the "book" schema itself — teaching the
// ingestor to fill whatever names a user's schema happens to declare is
// the "natural language operations" step the product notes name for
// later, not this pass.
import fs from "node:fs";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import type { Element } from "domhandler";
import type { Field } from "@index/database/types";

function localName(tag: string): string {
  const at = tag.indexOf(":");
  return at === -1 ? tag : tag.slice(at + 1);
}

/** Every Dublin Core element under `<metadata>` with this local name,
 * namespace prefix ignored — epub files are not consistent about it. */
function textsOf($: ReturnType<typeof cheerio.load>, name: string): string[] {
  return $("metadata")
    .find("*")
    .filter((_, el: Element) => localName(el.tagName).toLowerCase() === name)
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text !== "");
}

/** The one that looks like an ISBN (10 or 13 digits once punctuation is
 * stripped) among whatever `dc:identifier`s the file declares, or the
 * first identifier if none do. */
function isbnFrom(identifiers: string[]): string | undefined {
  for (const identifier of identifiers) {
    const digits = identifier.replace(/[^0-9Xx]/g, "");
    if (digits.length === 10 || digits.length === 13) return digits;
  }
  return identifiers[0];
}

/** `2020-05-01T00:00:00Z`, `2020`, `2020-05` all become a plain date the
 * predicate grammar's `{ field: { gte, lte } }` can compare against;
 * anything unparseable is kept as written rather than dropped. */
function normalizedDate(raw: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

export async function ingestBook(filepath: string): Promise<Field[]> {
  try {
    const buffer = await fs.promises.readFile(filepath);
    const zip = await JSZip.loadAsync(buffer);

    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) return [];
    const container = cheerio.load(containerXml, { xmlMode: true });
    const opfPath = container("rootfile").attr("full-path");
    if (!opfPath) return [];

    const opfXml = await zip.file(opfPath)?.async("string");
    if (!opfXml) return [];
    const opf = cheerio.load(opfXml, { xmlMode: true });

    const title = textsOf(opf, "title")[0];
    const author = textsOf(opf, "creator").join(", ");
    const published = textsOf(opf, "date")[0];
    const genre = textsOf(opf, "subject").join(", ");
    const isbn = isbnFrom(textsOf(opf, "identifier"));

    const fields: Field[] = [];
    if (title) fields.push({ name: "title", value: title, kind: "string" });
    if (author) fields.push({ name: "author", value: author, kind: "string" });
    if (published) fields.push({ name: "published", value: normalizedDate(published), kind: "date" });
    if (genre) fields.push({ name: "genre", value: genre, kind: "string" });
    if (isbn) fields.push({ name: "isbn", value: isbn, kind: "string" });
    return fields;
  } catch {
    // Best-effort, like every other derivation (derivations.ts): a book
    // with unreadable metadata still gets classified, just with nothing
    // pre-filled.
    return [];
  }
}
