// Authored by Karter Whitman using Claude Sonnet 5
// Book metadata, read straight from the epub's own OPF package document
// (container.xml points at it; Dublin Core elements hold the rest) — no
// network, no guessing beyond what the file already declares.
//
// The keys here are the epub's own vocabulary flattened to a v1
// convention (title/author/published/genre/isbn), not names read off any
// "book" schema. Joining an observation's key to whatever a user's schema
// actually calls that field is `extract.ts`'s job, and today it does the
// identity map; see the note there.
import * as cheerio from "cheerio";
import JSZip from "jszip";
import type { Element } from "domhandler";
import type { Observation } from "../extract.js";
import type { Probe } from "../probe.js";

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

/**
 * Dublin Core repeats an element rather than delimiting it, so `creator`
 * and `subject` genuinely arrive as several values. Reporting the shape
 * that was actually found — one string, or a list — is what lets the
 * schema join do the right thing in both directions: `extract.ts` widens
 * a lone value when a field declares `list`, and joins several back into
 * one line when it declares `string`. Flattening here instead would make
 * a `list` field hold a single entry with commas in it.
 */
function observed(key: string, values: string[]): Observation | null {
  if (values.length === 0) return null;
  if (values.length === 1) return { key, value: values[0] as string, kind: "string" };
  return { key, value: values, kind: "list" };
}

export async function extractBook(probe: Probe): Promise<Observation[]> {
  try {
    // The probe's buffer, not a read of our own — for an epub this is the
    // only full read of the file that happens on the way in, and the hash
    // shares it rather than streaming the same bytes a second time.
    const zip = await JSZip.loadAsync(await probe.bytes());

    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) return [];
    const container = cheerio.load(containerXml, { xmlMode: true });
    const opfPath = container("rootfile").attr("full-path");
    if (!opfPath) return [];

    const opfXml = await zip.file(opfPath)?.async("string");
    if (!opfXml) return [];
    const opf = cheerio.load(opfXml, { xmlMode: true });

    const title = textsOf(opf, "title")[0];
    const published = textsOf(opf, "date")[0];
    const isbn = isbnFrom(textsOf(opf, "identifier"));

    const observations: Observation[] = [];
    if (title) observations.push({ key: "title", value: title, kind: "string" });

    const author = observed("author", textsOf(opf, "creator"));
    if (author) observations.push(author);

    if (published) {
      observations.push({ key: "published", value: normalizedDate(published), kind: "date" });
    }

    const genre = observed("genre", textsOf(opf, "subject"));
    if (genre) observations.push(genre);

    if (isbn) observations.push({ key: "isbn", value: isbn, kind: "string" });
    return observations;
  } catch {
    // Best-effort, like every other derivation (derivations.ts): a book
    // with unreadable metadata still gets classified, just with nothing
    // pre-filled.
    return [];
  }
}
