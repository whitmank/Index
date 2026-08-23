// Authored by Karter Whitman using Claude Sonnet 5
// The trad stage: a first guess at an item's type from what its resource
// declares about itself — a media type, a url's host, a page's own
// schema.org markup — never a language model. Deterministic, free, and
// tried before the ai stage (classify-resource.ts) is asked to spend a
// model call on anything trad can already answer.
//
// A null answer here means "no opinion", not "untyped" — the caller
// (classify-resource.ts) keeps looking; nothing here ever overwrites a
// type a user set, since that rule belongs to whoever owns the item, not
// to a classifier that has never seen one.
import { formatOfResource } from "@index/database";
import type { Resource } from "@index/database/types";
import { PDF_MIME, readPdf, typeOfPdf } from "./pdf-reader.js";
import { declaresArticle } from "./schema-org.js";

/**
 * The narrow shape trad classification needs from whatever opened the
 * resource — every member also present on backend's own file/web `Probe`,
 * so the caller passes that straight in with no adapter. Same "port, not
 * concrete coupling" shape as `SourceGateway` (source-resolution.ts), just
 * narrower: this one only ever reads a single already-open handle, never
 * resolves a uri to one.
 */
export interface ClassificationSource {
  kind: "file" | "web";
  size: number;
  head: Buffer;
  tail(): Promise<Buffer>;
  mime(): Promise<string | null>;
  text(): Promise<string>;
}

const SPOTIFY_ALBUM_URL = /open\.spotify\.com\/album\/[A-Za-z0-9]+/;

function isSpotifyAlbumUrl(url: string): boolean {
  return SPOTIFY_ALBUM_URL.test(url);
}

function isWikipediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".wikipedia.org") && parsed.pathname.startsWith("/wiki/");
  } catch {
    return false;
  }
}

/**
 * First match wins, same shape as the format ladder — but its own ladder,
 * not a proxy for it: today's only file rule happens to coincide with
 * `format` (an epub is unambiguously a book), but a later rule need not
 * (a recipe guessed from a markdown file's content, say).
 *
 * The source is what makes later rules possible, and it already pays off
 * on the one rule there is. `formatOfResource` reads `resource.cached.mime`
 * before it falls back to the extension — so "is this a book?" is
 * answered by the media type the file itself declares, catching a
 * mis-named `.zip` and turning away an `.epub` that is not one. The
 * extension remains the answer only when there was no source to ask (a
 * web uri, an unreachable device).
 *
 * The web rules are host matches rather than anything about the web as
 * such, and deliberately so: `link` is already the format meaning "a
 * page", so a type that fires on every url would just be reading the
 * format back. An album, a video and an essay are all pages; what
 * separates them is whose page it is.
 *
 * The Spotify rule is a plain url match, not a network call — an item
 * gets typed "album" the instant it's created, whether or not a heavier
 * song-import that follows ever succeeds. Wikipedia is the same shape:
 * every `/wiki/` page is an article, which is a thing known about that
 * host rather than anything read off the page.
 *
 * The pdf rung is the one place a media type is not enough to name the
 * thing, and so the only one that reads inside the file: an epub is a
 * book by construction, but the same pdf bytes carry a novel, a paper
 * and a receipt. What separates them is what the file itself declares —
 * a doi, an isbn, a length — which is `typeOfPdf`'s ladder to walk
 * (pdf-reader.ts).
 *
 * Host rules come first because they are free and certain. The page's
 * own declaration is the general case and runs last: a site nobody has
 * written a rule for still gets typed if it says plainly what it is.
 */
export async function classifyTrad(
  resource: Resource,
  source: ClassificationSource | null,
): Promise<string | null> {
  if (formatOfResource(resource) === "book") return "book";
  if (source && (await source.mime()) === PDF_MIME) return typeOfPdf(await readPdf(source));
  if (isSpotifyAlbumUrl(resource.uri)) return "album";
  if (isWikipediaUrl(resource.uri)) return "article";

  if (source?.kind === "web" && declaresArticle(await source.text())) return "article";

  return null;
}
