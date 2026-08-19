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
import { listSchemas, schemaFor, type DataEntry, type Resource, type Schema } from "@index/database";
import { selfDevice } from "../config.js";
import { deriveForResource } from "./derivations.js";
import { classifyResource } from "./ingest/classify.js";
import { extract } from "./ingest/extract.js";
import { openProbe, type Probe } from "./ingest/probe.js";

function isWebUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/**
 * The media type the bytes themselves declare, put on the resource before
 * anything downstream reads it — the format ladder consults `cached.mime`
 * before it falls back to guessing from the extension, so this is what
 * lets a mis-named file still be understood.
 *
 * Best-effort, like every derivation: a resource with no probe (a link,
 * an unreachable device) simply passes through unchanged.
 */
async function withMime(resource: Resource, probe: Probe | null): Promise<Resource> {
  const mime = await probe?.mime();
  if (!mime) return resource;
  return { ...resource, cached: { ...resource.cached, mime } };
}

/**
 * The content signature relink.ts searches by, captured while the file is
 * known to exist — it is the one thing on a resource that cannot be
 * recomputed once the file moves.
 *
 * Deliberately last: `Probe.hash` signs bytes already in memory when a
 * reader has loaded them, so taking it after extraction means an epub is
 * read once on the way in rather than twice, while a file nobody needed
 * to open is still streamed instead of buffered.
 */
async function withIdentity(resource: Resource, probe: Probe | null): Promise<Resource> {
  // A page has bytes but no stable identity — they change under the url
  // without the resource having moved, which is the opposite of what
  // relink searches for. Only a file gets signed.
  if (probe?.kind !== "file") return resource;
  try {
    return { ...resource, contentHash: await probe.hash(), size: probe.size };
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
  /** The classifier's guess — null when nothing matched. Whether it may
   * be used is the caller's rule, not this one's: an item takes a guess
   * only for the resource that becomes its *primary*, and never over a
   * type its user set. `lib/resources.ts` owns that, since it is the
   * layer that knows which position a resource landed in. */
  type: string | null;
  /** Best-effort extraction, keyed to `type`'s extractor; empty when
   * there is none for the guessed type, or it found nothing. */
  entries: DataEntry[];
  /** What the content says this should be called, when its format has a
   * name to offer — a book's title, where `resource.name` is only ever
   * the filename it happened to be saved under. Absent for everything
   * else, which leaves the derived name standing. */
  name?: string;
}

/**
 * Paths and urls → resources with their observations, derivations,
 * classification and extracted fields already attached, so the renderer
 * can write them into an item with one ordinary change (PRODUCT-SPEC
 * §2.4: metadata is fetched once, at resource creation, by the same
 * change that adds the resource).
 *
 * The order is load-bearing at both ends. One probe is opened per input
 * and every later step reads from it, rather than each opening the file
 * for itself. `mime` goes on first, because `deriveForResource` and
 * `classifyResource` both ask the format ladder and the ladder consults
 * it. Hashing goes on last, because by then anything that needed the
 * whole file has loaded it and the signature can be taken from memory.
 */
export async function pathsToResources(inputs: string[]): Promise<IntakeResult[]> {
  // Read once for the whole drop rather than once per file, and never
  // fatally: a schema list that can't be loaded means extraction falls
  // back to the format's own vocabulary, which is what it did before
  // schemas were consulted at all.
  const schemas = await listSchemas().catch(() => [] as Schema[]);

  return Promise.all(
    inputs.map(async (input) => {
      const uri = isWebUrl(input) ? input : pathToUri(input);
      const probe = await openProbe(uri);
      const sniffed = await withMime({ uri, name: nameFor(input) }, probe);

      const cached = await deriveForResource(sniffed, probe);
      const derived = Object.keys(cached).length > 0 ? { ...sniffed, cached } : sniffed;

      const type = await classifyResource(derived, probe);
      const { name, entries } = await extract(
        type,
        probe,
        schemaFor(schemas, type),
      );

      return {
        resource: await withIdentity(derived, probe),
        type,
        entries,
        ...(name ? { name } : {}),
      };
    }),
  );
}
