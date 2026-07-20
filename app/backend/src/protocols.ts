// Authored by Karter Whitman using Claude Opus 4.8
// `res://` and `thumb://` (PRODUCT-SPEC §2.3). These exist so an ordinary
// <img>/<video> in the renderer can stream any device's content by uri
// without the renderer ever touching the filesystem. urls.ts mints the
// urls these handle, and explains their shape.
import fs from "node:fs";
import { Readable } from "node:stream";
import { protocol, net } from "electron";
import { thumbnail } from "./services/derivations.js";
import { resolve } from "./services/resolver.js";
import { RES_SCHEME, THUMB_SCHEME } from "./urls.js";

const WEB_TIMEOUT_MS = 10_000;

function uriFrom(requestUrl: string, scheme: string): string | null {
  // Accepts `<scheme>://uri/<encoded>` (what urls.ts mints) as well as
  // the spec's `<scheme>://<encoded>` and an empty-host `<scheme>:///…`.
  const afterScheme = requestUrl.slice(`${scheme}://`.length);
  const slash = afterScheme.indexOf("/");
  const body = slash === -1 ? afterScheme : afterScheme.slice(slash + 1);
  try {
    return decodeURIComponent(body) || null;
  } catch {
    return null;
  }
}

// The renderer's origin is the Vite dev server in development and a
// file:// document in production; neither is this scheme, so every
// response has to say it is shareable.
const CORS = { "Access-Control-Allow-Origin": "*" };

function notFound(): Response {
  return new Response(null, { status: 404, headers: CORS });
}

function fileResponse(filepath: string, request: Request): Response {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(filepath);
  } catch {
    return notFound();
  }
  if (!stats.isFile()) return notFound();

  // Range support is what makes video and audio scrubbable.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : stats.size - 1;
    if (start >= stats.size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { ...CORS, "Content-Range": `bytes */${stats.size}` },
      });
    }
    const stream = fs.createReadStream(filepath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...CORS,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = fs.createReadStream(filepath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...CORS, "Content-Length": String(stats.size), "Accept-Ranges": "bytes" },
  });
}

async function webResponse(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const upstream = await net.fetch(url, { signal: controller.signal });
    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return notFound();
  } finally {
    clearTimeout(timeout);
  }
}

export function registerProtocols(): void {
  protocol.handle(RES_SCHEME, async (request) => {
    const uri = uriFrom(request.url, RES_SCHEME);
    if (!uri) return notFound();

    const resolved = resolve(uri);
    if (!resolved) return notFound();
    return resolved.kind === "file"
      ? fileResponse(resolved.filepath, request)
      : webResponse(resolved.url);
  });

  protocol.handle(THUMB_SCHEME, async (request) => {
    const uri = uriFrom(request.url, THUMB_SCHEME);
    if (!uri) return notFound();

    // 404 while minting fails; the renderer falls back to `res://`.
    const minted = await thumbnail(uri);
    if (!minted) return notFound();
    return fileResponse(minted, request);
  });
}

/**
 * Both schemes must be privileged before the app is ready, so the
 * renderer may fetch them and treat their responses as ordinary media.
 * `standard` is safe here precisely because the encoded uri rides in the
 * path (see urls.ts) — Chromium normalises a standard scheme's authority,
 * and there is nothing in ours to normalise.
 */
export function registerSchemes(): void {
  const privileges = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  };
  protocol.registerSchemesAsPrivileged([
    { scheme: RES_SCHEME, privileges },
    { scheme: THUMB_SCHEME, privileges },
  ]);
}
