// Authored by Karter Whitman using Claude Opus 4.8
// Cached derivations: thumbnails and link metadata, minted on demand into
// ~/.index/cache. Everything here is disposable and rebuildable by
// definition — a missing derivation is never an error, only a plainer
// rendering.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { deviceOf, formatOfResource, type CachedDerivations, type Resource } from "@index/database";
import { CACHE_DIR } from "../config.js";
import { resolveExistingFile } from "./resolver.js";
import type { Probe } from "./ingest/probe.js";
import { linkMetadataFrom } from "./previews/linkMetadata.js";
import { previewFetch, withPreviewTimeout } from "./previews/fetch.js";

const THUMBNAIL_MAX_DIMENSION = 480; // PRODUCT-SPEC §4
const THUMBNAIL_SUFFIX = ".thumb.jpg";

export function cacheKey(uri: string): string {
  return crypto.createHash("sha1").update(uri).digest("hex");
}

export function thumbnailPath(uri: string): string {
  return path.join(CACHE_DIR, cacheKey(uri) + THUMBNAIL_SUFFIX);
}

/**
 * A page's own preview image or favicon lives at whatever url it gave —
 * out on the open web, not on any device this app knows how to read a
 * file from. Fetched once and handed to the same sharp pipeline a local
 * file goes through; a failed fetch is indistinguishable from "not an
 * image" to the caller, which already treats either as nothing to cache.
 */
async function fetchRemoteImage(url: string): Promise<Buffer | null> {
  try {
    return await withPreviewTimeout(async (signal) => {
      const response = await previewFetch(url, signal);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    });
  } catch {
    return null;
  }
}

/**
 * The cached thumbnail for a resource, minting it on first request.
 * Works from a device's own file when there is one, and otherwise — a
 * link's preview image, a favicon — fetches the url itself, so the
 * result lives on disk under `~/.index/cache` the same way either way:
 * once minted, it renders offline. Returns null when there is nothing to
 * thumbnail (an unreachable device, an unfetchable or unreadable url).
 */
export async function thumbnail(uri: string): Promise<string | null> {
  const destination = thumbnailPath(uri);
  if (fs.existsSync(destination)) return destination;

  const source = resolveExistingFile(uri) ?? (deviceOf(uri) === "web" ? await fetchRemoteImage(uri) : null);
  if (!source) return null;

  try {
    await sharp(source)
      .rotate() // honour EXIF orientation before resizing
      .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toFile(destination);
    return destination;
  } catch {
    // Not an image, or an image sharp can't read. Nothing to cache, and
    // nothing to report: the renderer has a placeholder for this.
    return null;
  }
}

/**
 * The derivations a resource can be given at creation time, written into
 * `resources[].cached` by the same change that adds the resource
 * (PRODUCT-SPEC §2.4). Deliberately best-effort: whatever fails is simply
 * absent.
 */
export async function deriveForResource(
  resource: Resource,
  probe: Probe | null = null,
): Promise<CachedDerivations> {
  const format = formatOfResource(resource);
  const cached: CachedDerivations = { ...resource.cached };

  if (format === "link" || format === "video") {
    // The page the probe already fetched, parsed here rather than
    // fetched a second time. No probe (unreachable, or a caller that
    // didn't open one) means an empty body, which the Wikipedia REST
    // fallback inside still recovers a title and extract from.
    const html = probe?.kind === "web" ? await probe.text() : "";
    const metadata = await linkMetadataFrom(resource.uri, html);
    // Minted now, while there's definitely a network — not left for
    // whoever opens this item first to discover there isn't one.
    if (metadata.favicon) {
      cached.favicon = metadata.favicon;
      await thumbnail(metadata.favicon);
    }
    if (metadata.preview_image) {
      cached.preview_image = metadata.preview_image;
      await thumbnail(metadata.preview_image);
    }
    if (metadata.card_title) cached.card_title = metadata.card_title;
    if (metadata.card_extract) cached.card_extract = metadata.card_extract;
    return cached;
  }

  if (!resolveExistingFile(resource.uri)) return cached;

  // `mime` is the probe's to write (ingest/probe.ts), not this module's:
  // it is an observation about the bytes, made once when they were first
  // opened, rather than a disposable rendering aid like everything else
  // here. By the time this runs, intake has already put it on `resource`,
  // so the format read above is the sniffed one, not the extension's.
  if (format === "image") {
    const minted = await thumbnail(resource.uri);
    if (minted) cached.thumbnail = `thumb://${encodeURIComponent(resource.uri)}`;
  }

  return cached;
}

/** Cache files whose uri no longer appears in any live record — what the
 * GC sweeps. */
export function orphanedCacheFiles(liveUris: string[]): string[] {
  const live = new Set(liveUris.map(cacheKey));
  let entries: string[];
  try {
    entries = fs.readdirSync(CACHE_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => {
      const key = entry.split(".")[0];
      return key !== undefined && !live.has(key);
    })
    .map((entry) => path.join(CACHE_DIR, entry));
}
