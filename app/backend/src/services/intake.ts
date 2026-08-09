// Authored by Karter Whitman using Claude Opus 4.8
// Files arriving from the OS — dropped, dialog-picked — become resource
// uris. Nothing is copied and nothing is uploaded: adding a file is
// recording a pointer to a path that already exists.
//
// [pinned here] No file watching in v1 (PRODUCT-SPEC §2.4). A pointer to
// a moved file 404s gracefully rather than being chased.
//
// [pinned here] `pathsToResources` also accepts an http(s) url. The spec
// gives the renderer exactly one way to turn something the user handed
// over into a resource, and a pasted link is the same gesture as a
// dropped file; overloading it beat inventing a second handler.
import fs from "node:fs";
import path from "node:path";
import type { Field, Resource } from "@index/database";
import { selfDevice } from "../config.js";
import { classifyResource } from "./classify.js";
import { deriveForResource } from "./derivations.js";
import { sha256File } from "./hash.js";
import { ingestBook } from "./ingest/book.js";
import { resolveExistingFile } from "./resolver.js";

/** Type-specific extractors, parallel to the renderer registry: additive
 * — a new type's ingestor is a new entry, not a change to this file's
 * control flow. */
const INGESTORS: Record<string, (filepath: string) => Promise<Field[]>> = {
  book: ingestBook,
};

async function ingest(type: string | null, resource: Resource): Promise<Field[]> {
  const ingestor = type ? INGESTORS[type] : undefined;
  if (!ingestor) return [];
  const filepath = resolveExistingFile(resource.uri);
  if (!filepath) return [];
  return ingestor(filepath);
}

function isWebUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/** The content signature relink.ts searches by, captured now while the
 * file is known to exist — best-effort, like `deriveForResource`. */
async function withIdentity(resource: Resource): Promise<Resource> {
  const filepath = resolveExistingFile(resource.uri);
  if (!filepath) return resource;
  try {
    const [contentHash, stat] = await Promise.all([
      sha256File(filepath),
      fs.promises.stat(filepath),
    ]);
    return { ...resource, contentHash, size: stat.size };
  } catch {
    return resource;
  }
}

export function pathToUri(absolutePath: string): string {
  return `${selfDevice()}://${absolutePath}`;
}

function nameFor(input: string): string {
  if (!isWebUrl(input)) return path.basename(input);
  try {
    const url = new URL(input);
    return url.hostname + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return input;
  }
}

export interface IntakeResult {
  resource: Resource;
  /** The classifier's guess — null when nothing matched. Callers minting
   * a brand-new item may use it; callers attaching a resource to one
   * that already exists must not, or a second file would silently
   * reclassify it. */
  type: string | null;
  /** Best-effort extraction, keyed to `type`'s ingestor; empty when
   * there is no ingestor for the guessed type, or it found nothing. */
  fields: Field[];
}

/**
 * Paths and urls → resources with their derivations, classification and
 * ingested fields already attached, so the renderer can write them into
 * an item with one ordinary change (PRODUCT-SPEC §2.4: metadata is
 * fetched once, at resource creation, by the same change that adds the
 * resource).
 */
export async function pathsToResources(inputs: string[]): Promise<IntakeResult[]> {
  return Promise.all(
    inputs.map(async (input) => {
      const resource: Resource = {
        uri: isWebUrl(input) ? input : pathToUri(input),
        name: nameFor(input),
      };
      const cached = await deriveForResource(resource);
      const withCache = Object.keys(cached).length > 0 ? { ...resource, cached } : resource;
      const withHash = await withIdentity(withCache);
      const type = classifyResource(withHash);
      const fields = await ingest(type, withHash);
      return { resource: withHash, type, fields };
    }),
  );
}
