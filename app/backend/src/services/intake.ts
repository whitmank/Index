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
import path from "node:path";
import type { Resource } from "@index/database";
import { selfDevice } from "../config.js";
import { deriveForResource } from "./derivations.js";

function isWebUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
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

/**
 * Paths and urls → resources with their derivations already attached, so
 * the renderer can write them into an item with one ordinary change
 * (PRODUCT-SPEC §2.4: metadata is fetched once, at resource creation, by
 * the same change that adds the resource).
 */
export async function pathsToResources(inputs: string[]): Promise<Resource[]> {
  return Promise.all(
    inputs.map(async (input) => {
      const resource: Resource = {
        uri: isWebUrl(input) ? input : pathToUri(input),
        name: nameFor(input),
      };
      const cached = await deriveForResource(resource);
      return Object.keys(cached).length > 0 ? { ...resource, cached } : resource;
    }),
  );
}
