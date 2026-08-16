// Authored by Karter Whitman using Claude Opus 5
// The seam between "a uri on an Item" and "bytes this machine can read".
//
// This module cannot resolve an Index uri by itself and should not learn
// how. A `device://path` uri means something only against the device
// config the Electron main process owns, and a workspace that reached
// into the backend for it would stop being independently testable — the
// property the spec asks for when it says the core operation should be
// side-effect-free and easy to run in a background job.
//
// So resolution is a port. The module ships a plain Node implementation
// that handles an absolute path, a `file://` url and http(s); the app
// passes one backed by its own resolver, and the same reader code runs
// against both without knowing which it got.
import fs from "node:fs";
import { WEB_MAX_BYTES } from "./content-limits.js";

export interface SourceGateway {
  /**
   * An absolute path this machine can read for `uri`, or null.
   *
   * Null is not an error — it is the ordinary answer for a web uri, a
   * device that is not this one, and a file that has moved. The caller
   * treats all three the same way: less to go on.
   */
  localPath(uri: string): string | null;

  /**
   * The bytes behind a url, up to `cap`, or null when it cannot be
   * reached. Implementations must stop reading at the cap rather than
   * buffering a whole response and slicing it.
   */
  fetch(uri: string, cap: number): Promise<Buffer | null>;
}

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Index item modeler)";

function isWebUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/**
 * Reads at most `cap` bytes of a response body, then hangs up — so a
 * server that streams forever costs the cap rather than the stream.
 */
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

/**
 * The default: no device config, no Electron, no app. An absolute path
 * or a `file://` url is a file; http(s) is fetched; anything else — an
 * Index `device://` uri among them — resolves to nothing here, which is
 * the honest answer for a gateway that has never heard of devices.
 */
export const nodeGateway: SourceGateway = {
  localPath(uri: string): string | null {
    if (isWebUrl(uri)) return null;

    let candidate = uri;
    if (uri.startsWith("file://")) {
      try {
        candidate = new URL(uri).pathname;
      } catch {
        return null;
      }
    }
    if (!candidate.startsWith("/")) return null;

    try {
      return fs.statSync(candidate).isFile() ? candidate : null;
    } catch {
      return null;
    }
  },

  async fetch(uri: string, cap = WEB_MAX_BYTES): Promise<Buffer | null> {
    if (!isWebUrl(uri)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(uri, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) return null;
      return await readCapped(response, cap);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },
};

/**
 * A gateway that reads nothing. For callers that want the module to work
 * strictly from evidence they supply, and for `allowNetworkAccess: false`
 * to be enforceable rather than advisory.
 */
export const offlineGateway: SourceGateway = {
  localPath: (uri) => nodeGateway.localPath(uri),
  fetch: async () => null,
};
