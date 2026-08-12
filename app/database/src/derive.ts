// Authored by Karter Whitman using Claude Opus 4.8
// The derivation ladder (DESIGN-CONCEPT §2): device and format are read
// off the primary resource, never stored. ARCHITECTURE has the renderer
// mirror these client-side; this copy is the one the repository and the
// backend services use.
import type { Format, Item, Resource } from "./types.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|embed)|youtu\.be\/)/i;

/** The authority segment of a resource uri: `web` for the internet, the
 * scheme otherwise (`mbp://Users/k/x.jpg` ⇒ `mbp`). */
export function deviceOf(uri: string): string {
  const scheme = uri.slice(0, uri.indexOf("://")).toLowerCase();
  if (scheme === "http" || scheme === "https") return "web";
  return scheme || "local";
}

/** The uri prefix that a `{ device }` predicate matches against. */
export function devicePrefix(device: string): string {
  return device === "web" ? "http" : `${device}://`;
}

function extensionOf(uri: string): string {
  const withoutQuery = uri.split(/[?#]/, 1)[0] ?? uri;
  const basename = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? "" : basename.slice(dot + 1).toLowerCase();
}

function isWeb(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/**
 * First match wins — PRODUCT-SPEC §1.6.
 *
 * `mime` is what the bytes said when anything read them (the ingestor's
 * probe sniffs it at intake, or a page's Content-Type declares it); the
 * extension is only what the name claims. So the extension clauses are
 * gated on nothing having been sniffed: where both exist and disagree,
 * the bytes win, and a plain zip wearing `.epub` stops being a book.
 *
 * The web rungs stay keyed to the url rather than the media type,
 * because every page worth telling apart serves `text/html` — a video
 * and an essay are the same media type and a different kind of thing.
 */
export function formatOfResource(resource: Resource | undefined): Format {
  if (!resource) return "bare";

  const { uri } = resource;
  const mime = resource.cached?.mime ?? "";
  const unread = mime === "";
  const extension = extensionOf(uri);

  if (mime.startsWith("image/") || (unread && IMAGE_EXTENSIONS.has(extension))) return "image";
  if (mime === "text/markdown" || (unread && MARKDOWN_EXTENSIONS.has(extension))) return "markdown";
  if (mime === "application/epub+zip" || (unread && extension === "epub")) return "book";
  if (isWeb(uri) && YOUTUBE_PATTERN.test(uri)) return "video";
  if (isWeb(uri)) return "link";
  return "file";
}

export function formatOf(item: Item): Format {
  return formatOfResource(item.resources[0]);
}
