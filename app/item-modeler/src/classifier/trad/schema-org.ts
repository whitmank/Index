// Authored by Karter Whitman using Claude Opus 5
// What a page declares itself to be, in its own JSON-LD.
//
// This is the web's equivalent of an epub's OPF: a statement the document
// makes about itself, not an inference drawn from its shape. That matters
// because the inferences don't survive contact — measured across real
// pages, `og:type` reads "website" on a Wikipedia article and "object" on
// a GitHub repo, and an `<article>` element appears on the BBC's front
// page and on a repo's README. Anything built on those would type a code
// host as an essay.
//
// schema.org holds up because it is narrow and voluntary. A page that
// declares `NewsArticle` means it; a page that declares nothing gets no
// opinion, which is the correct failure — a null guess never overwrites a
// type, so silence costs nothing and a wrong answer would cost a great
// deal.
import * as cheerio from "cheerio";

/** Types whose plain meaning is "a piece of writing". Deliberately not
 * the whole schema.org article tree: `Report` and `TechArticle` are
 * articles in the ontology's sense but often label documentation and
 * product pages, and a type nobody would call an article by hand does
 * not belong here. */
const ARTICLE_TYPES = new Set([
  "article",
  "newsarticle",
  "blogposting",
  "scholarlyarticle",
  "socialmediaposting",
]);

/** Every `@type` a document declares, flattened: an object may carry
 * several, JSON-LD may be an array of objects, and a `@graph` holds more
 * of them. */
function typesIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const entry of node) typesIn(entry, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;

  const record = node as Record<string, unknown>;
  const declared = record["@type"];
  if (typeof declared === "string") found.push(declared);
  else if (Array.isArray(declared)) {
    for (const entry of declared) if (typeof entry === "string") found.push(entry);
  }

  typesIn(record["@graph"], found);
  return found;
}

/** The schema.org types a page declares about itself, lowercased. Empty
 * when it declares none, or when what it declares isn't valid JSON —
 * both of which are ordinary. */
export function declaredTypes(html: string): string[] {
  if (!html) return [];
  try {
    const $ = cheerio.load(html);
    const types: string[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        typesIn(JSON.parse($(element).text()), types);
      } catch {
        // One malformed block shouldn't cost the page its other blocks.
      }
    });
    return types.map((type) => type.toLowerCase());
  } catch {
    return [];
  }
}

/** Whether the page calls itself a piece of writing. */
export function declaresArticle(html: string): boolean {
  return declaredTypes(html).some((type) => ARTICLE_TYPES.has(type));
}
