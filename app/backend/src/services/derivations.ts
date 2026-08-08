// Authored by Karter Whitman using Claude Opus 4.8
// Cached derivations: thumbnails and link metadata, minted on demand into
// ~/.index/cache. Everything here is disposable and rebuildable by
// definition — a missing derivation is never an error, only a plainer
// rendering.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { formatOfResource, type CachedDerivations, type Resource } from "@index/database";
import { CACHE_DIR } from "../config.js";
import { resolveExistingFile } from "./resolver.js";
import { fetchLinkMetadata } from "./previews/linkMetadata.js";

const THUMBNAIL_MAX_DIMENSION = 480; // PRODUCT-SPEC §4
const THUMBNAIL_SUFFIX = ".thumb.jpg";

export function cacheKey(uri: string): string {
  return crypto.createHash("sha1").update(uri).digest("hex");
}

export function thumbnailPath(uri: string): string {
  return path.join(CACHE_DIR, cacheKey(uri) + THUMBNAIL_SUFFIX);
}

/**
 * The cached thumbnail for a resource, minting it on first request.
 * Returns null when there is nothing to thumbnail (a link, an unreachable
 * device) — the caller falls back to `res://`.
 */
export async function thumbnail(uri: string): Promise<string | null> {
  const destination = thumbnailPath(uri);
  if (fs.existsSync(destination)) return destination;

  const source = resolveExistingFile(uri);
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
export async function deriveForResource(resource: Resource): Promise<CachedDerivations> {
  const format = formatOfResource(resource);
  const cached: CachedDerivations = { ...resource.cached };

  if (format === "link" || format === "video") {
    const metadata = await fetchLinkMetadata(resource.uri);
    if (metadata.favicon) cached.favicon = metadata.favicon;
    if (metadata.preview_image) cached.preview_image = metadata.preview_image;
    if (metadata.card_title) cached.card_title = metadata.card_title;
    if (metadata.card_extract) cached.card_extract = metadata.card_extract;
    return cached;
  }

  const file = resolveExistingFile(resource.uri);
  if (!file) return cached;

  if (format === "image") {
    const minted = await thumbnail(resource.uri);
    if (minted) cached.thumbnail = `thumb://${encodeURIComponent(resource.uri)}`;
    try {
      const metadata = await sharp(file).metadata();
      if (metadata.format) cached.mime = `image/${metadata.format}`;
    } catch {
      /* the format ladder falls back to the extension */
    }
  }

  return cached;
}

/** Warm a resource's derivations without making anyone wait: intake calls
 * this and moves on. */
export function warm(resource: Resource): void {
  void deriveForResource(resource).catch(() => {
    /* best-effort by definition */
  });
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
