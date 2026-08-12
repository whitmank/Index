// Authored by Karter Whitman using Claude Sonnet 5
// The classifier: a first guess at an item's type. Stored (Item.type) and
// user-overridable from there — never a live derivation the way `format`
// is, because the user can overrule it and a derivation would argue back.
//
// It re-runs only when the primary resource changes, and never over a
// `type_source` of "user" (lib/resources.ts holds that rule, since it is
// the layer that knows which resource became primary). A null answer here
// means "no opinion", not "untyped": callers keep whatever type they had.
import { formatOfResource } from "@index/database";
import type { Resource } from "@index/database/types";
import { isWikipediaUrl } from "../previews/wikipedia.js";
import { isSpotifyAlbumUrl } from "../spotify.js";
import { openProbe, type Probe } from "./probe.js";
import { declaresArticle } from "./signals/schemaOrg.js";

/**
 * First match wins, same shape as the format ladder — but its own ladder,
 * not a proxy for it: v1's only file rule happens to coincide with
 * `format` (an epub is unambiguously a book), but a later rule need not
 * (a recipe guessed from a markdown file's content, say).
 *
 * The probe is what makes those later rules possible, and it already pays
 * off on the one rule there is. `formatOfResource` reads `cached.mime`
 * before it falls back to the extension, and intake fills that in from
 * the probe's sniff — so "is this a book?" is answered by the media type
 * the file itself declares, catching a mis-named `.zip` and turning away
 * an `.epub` that is not one. The extension remains the answer only when
 * there was no probe to ask (a web uri, an unreachable device).
 *
 * The web rules are host matches rather than anything about the web as
 * such, and deliberately so: `link` is already the format meaning "a
 * page", so a type that fires on every url would just be reading the
 * format back. An album, a video and an essay are all pages; what
 * separates them is whose page it is.
 *
 * The Spotify rule is a plain url match, not a network call — an item
 * gets typed "album" (and so the album layout) the instant it's created,
 * whether or not the heavier song-import that follows (lib/spotify.ts,
 * frontend) ever succeeds. Wikipedia is the same shape: every `/wiki/`
 * page is an article, which is a thing known about that host rather than
 * anything read off the page.
 *
 * Host rules come first because they are free and certain. The page's
 * own declaration is the general case and runs last: a site nobody has
 * written a rule for still gets typed if it says plainly what it is.
 */
export async function classifyResource(
  resource: Resource | undefined,
  probe: Probe | null,
): Promise<string | null> {
  if (formatOfResource(resource) === "book") return "book";
  if (!resource) return null;
  if (isSpotifyAlbumUrl(resource.uri)) return "album";
  if (isWikipediaUrl(resource.uri)) return "article";

  if (probe?.kind === "web" && declaresArticle(await probe.text())) return "article";

  return null;
}

/**
 * Classify a uri that is already on an item — the reorder and detach
 * paths, which have a resource but no intake pipeline around it. Opens
 * its own probe and mints the same `cached.mime` intake would, so the
 * answer does not silently depend on which door it came through.
 */
export async function classifyUri(uri: string, name: string): Promise<string | null> {
  const probe = await openProbe(uri);
  const mime = (await probe?.mime()) ?? undefined;
  const resource: Resource = mime ? { uri, name, cached: { mime } } : { uri, name };
  return classifyResource(resource, probe);
}
