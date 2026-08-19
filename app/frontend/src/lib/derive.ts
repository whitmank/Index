// Authored by Karter Whitman using Claude Opus 4.8
// The derivation ladder (DESIGN-CONCEPT §2), mirrored client-side as
// ARCHITECTURE prescribes: device, format and roles are computed at read
// time, never stored, and the views need them on every render.
//
// This mirrors app/database/src/derive.ts. If the ladder changes, both
// change — the alternative was importing runtime code from the database
// package into the renderer bundle, which the dependency rule forbids.
import type { AttributeKind, Connection, Format, Item, Resource, Schema } from "@index/database/types";
import { MEMBER_OF_LABEL_ID } from "./seeds.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|embed)|youtu\.be\/)/i;

/** Mirrors @index/database's own, for the reason in this file's header.
 *
 * Case-insensitively: a schema's identity is its slugified id (always
 * lowercase) while its `name` is stored as typed, so `Song` and `song`
 * are one row and a lookup that distinguishes them finds nothing. The
 * classifier and the Spotify import both write lowercase types. */
export function sameTypeName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The schema a type names, or undefined. */
export function schemaFor<T extends { name: string }>(
  schemas: T[],
  type: string | null,
): T | undefined {
  if (!type) return undefined;
  return schemas.find((schema) => sameTypeName(schema.name, type));
}

/** A type's own field: its attribute name, and the kind its value editor
 * should present as — `list` gets chips (ListValueInput), everything
 * else a single line (SettleInput). */
export interface KnownField {
  attribute: string;
  kind: AttributeKind;
}

/** The attributes a type's schema pulls out of the generic list into
 * their own always-present, editable rows — everything but the identity
 * attribute (already drawn as the item's name, above these) and anything
 * marked `display: false`. An untyped item, one whose type names no
 * schema, or one with nothing left after both filters gets none: the
 * generic FieldsEditor (which excludes whatever this returns) draws
 * everything instead. */
export function knownFieldsFor(type: string | null, schemas: Schema[]): KnownField[] {
  const schema = schemaFor(schemas, type);
  const declared = schema?.attributes.slice(1).filter((attribute) => attribute.display) ?? [];
  return declared.map((attribute) => ({ attribute: attribute.attribute, kind: attribute.kind }));
}

export function deviceOf(uri: string): string {
  const scheme = uri.slice(0, uri.indexOf("://")).toLowerCase();
  if (scheme === "http" || scheme === "https") return "web";
  return scheme || "local";
}

/** The three ways a resource's location reads, at a glance: out on the
 * open web, on the machine you're using right now, or on some other
 * device (a mount, a synced folder) that happens to be reachable. */
export type DeviceKind = "web" | "local" | "remote";

/** `deviceOf`'s raw scheme, resolved against this machine's own device
 * id — only the bridge knows that id, so it comes in as an argument
 * (store/device.ts's `useSelfDevice`) rather than being read here.
 * `null` means it hasn't answered yet; guessing "local" for that beat
 * is right far more often than "remote" would be, and self-corrects the
 * moment it does. */
export function deviceKindOf(uri: string, selfDevice: string | null): DeviceKind {
  const device = deviceOf(uri);
  if (device === "web") return "web";
  if (selfDevice === null) return "local";
  return device === selfDevice ? "local" : "remote";
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

/** A glyph per format, the counterpart of VIEW_GLYPH: where that says
 * which kind of place something is, this says which kind of thing. */
export const FORMAT_GLYPH: Record<Format, string> = {
  bare: "·",
  image: "▣",
  markdown: "¶",
  book: "▤",
  video: "▶",
  link: "↗",
  file: "▢",
};

export function primaryResource(item: Item): Resource | undefined {
  return item.resources[0];
}

/** What a node should draw: the best image the item can offer, or
 * nothing — in which case the canvas draws a plain circle. A link's
 * preview image lives at whatever url the page gave it — `thumb://`
 * fetches and caches that url the same way it thumbnails a device's own
 * file (backend/services/derivations.ts), so it's on disk under
 * `~/.index/cache` and keeps rendering once there's no network to fetch
 * it fresh from. */
export function nodeImageUrl(item: Item): string | null {
  const resource = primaryResource(item);
  if (!resource) return null;

  if (formatOfResource(resource) === "image") return window.index.url.thumb(resource.uri);
  const remote = resource.cached?.preview_image ?? resource.cached?.favicon ?? null;
  return remote ? window.index.url.thumb(remote) : null;
}

/** The caption drawn under a node; blank means draw nothing. */
export function captionOf(item: Item): string {
  return (item.data.display_name?.value as string | undefined) ?? (item.data.name.value as string);
}

/** Roles are read off the graph, never stored (DESIGN-CONCEPT §3). Both
 * of these answer from what the pool happens to hold, which is what the
 * views need — a full answer would be a query. */
export function looksLikeSet(item: Item, inbound: Connection[]): boolean {
  return item.set !== false || inbound.some((connection) => connection.label === MEMBER_OF_LABEL_ID);
}

export function looksLikeTag(inbound: Connection[]): boolean {
  return inbound.length > 0;
}
