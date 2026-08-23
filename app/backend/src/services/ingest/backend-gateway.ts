// Authored by Karter Whitman using Claude Sonnet 5
// The seam item-modeler's evidence collection reads sources through
// (`@index/item-modeler`'s `source-resolution.ts` own doc comment: "the
// app passes one backed by its own resolver") — backed by this app's
// real device config and resolver, not the package's plain node-only
// default (`nodeGateway`, which has never heard of a `device://` uri).
import type { SourceGateway } from "@index/item-modeler";
import { previewFetch, withPreviewTimeout } from "../previews/fetch.js";
import { resolveExistingFile } from "../resolver.js";

/** Reads at most `cap` bytes of a response body, then hangs up — a server
 * that streams forever costs the cap rather than the stream. Mirrors
 * item-modeler's own `nodeGateway.fetch`, since this is the same seam
 * with a real resolver behind it rather than none. */
async function readCapped(response: Response, cap: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let read = 0;
  while (read < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    read += value.byteLength;
  }
  void reader.cancel().catch(() => {});
  return Buffer.concat(chunks, Math.min(read, cap));
}

export const backendGateway: SourceGateway = {
  localPath(uri: string): string | null {
    return resolveExistingFile(uri);
  },

  async fetch(uri: string, cap: number): Promise<Buffer | null> {
    try {
      return await withPreviewTimeout(async (signal) => {
        const response = await previewFetch(uri, signal);
        if (!response.ok) return null;
        return readCapped(response, cap);
      });
    } catch {
      return null;
    }
  },
};
