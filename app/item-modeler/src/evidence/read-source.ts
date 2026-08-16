// Authored by Karter Whitman using Claude Opus 5
// Opening one source: bounded reads, a sniffed media type, nothing loaded
// that nobody asked for.
//
// Identification is done by looking at the bytes rather than at the name,
// because a file's extension is a claim by whoever saved it and its
// server's Content-Type is a claim by whoever configured that server. A
// `.zip` that is really an epub and an `.epub` that is really a zip both
// turn up in a library of any size, and both are read correctly here and
// wrongly by anything trusting the suffix.
import crypto from "node:crypto";
import fs from "node:fs";
import {
  HEAD_BYTES,
  MAX_WHOLE_FILE_BYTES,
  TAIL_BYTES,
  WEB_MAX_BYTES,
} from "./content-limits.js";
import { once, sourceIdFor, type SourceEvidence } from "./source-evidence.js";
import type { SourceGateway } from "./source-resolution.js";

export const EPUB_MIME = "application/epub+zip";
export const PDF_MIME = "application/pdf";

function startsWith(head: Buffer, bytes: number[]): boolean {
  return bytes.length <= head.length && bytes.every((byte, at) => head[at] === byte);
}

function ascii(head: Buffer, start: number, end: number): string {
  return head.subarray(start, end).toString("latin1");
}

// A zip local file header: a 4-byte signature, then 26 more before the
// filename begins.
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const ZIP_HEADER_BYTES = 30;
const EPUB_MIMETYPE_MAX = 128; // a media type, not a payload

/**
 * An epub is a zip whose first entry is an uncompressed file named
 * `mimetype` holding the media type — required by the OCF spec precisely
 * so a reader can identify one without unzipping it. That puts the answer
 * at a fixed offset inside the first few dozen bytes of every conformant
 * file.
 */
function declaredZipMime(head: Buffer): string | null {
  if (!startsWith(head, ZIP_SIGNATURE) || head.length < ZIP_HEADER_BYTES) return null;

  const compressedSize = head.readUInt32LE(18);
  const nameLength = head.readUInt16LE(26);
  const extraLength = head.readUInt16LE(28);
  const nameEnd = ZIP_HEADER_BYTES + nameLength;

  // Anything not leading with `mimetype` is an ordinary zip, however it
  // happens to be named: an OCF container is required to lead with one.
  if (ascii(head, ZIP_HEADER_BYTES, nameEnd) !== "mimetype") return "application/zip";

  // Conformant files store that entry uncompressed, so its bytes are the
  // media type and its compressed size is that string's length.
  const start = nameEnd + extraLength;
  const readable = compressedSize > 0 && compressedSize <= EPUB_MIMETYPE_MAX;
  const declared = readable ? ascii(head, start, start + compressedSize).trim() : "";
  if (/^[\w.+-]+\/[\w.+-]+$/.test(declared)) return declared;

  // Named `mimetype` but unreadable — deflated, which the spec forbids
  // and real files do anyway. Nothing else puts a file of exactly that
  // name first, so guessing epub beats demoting a real book over a
  // packaging mistake.
  return EPUB_MIME;
}

/** Magic numbers, first match wins. Deliberately short: this feeds the
 * reader table, and is not trying to be libmagic. */
function sniff(head: Buffer): string | null {
  const zip = declaredZipMime(head);
  if (zip) return zip;

  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF_MIME; // "%PDF-"
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";

  const gif = ascii(head, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";

  return null;
}

/** At most `HEAD_BYTES` — an fd and a partial read, so identifying a
 * video costs 64 KB rather than the video. */
async function readHead(filepath: string, size: number): Promise<Buffer> {
  const length = Math.min(size, HEAD_BYTES);
  if (length === 0) return Buffer.alloc(0);

  const handle = await fs.promises.open(filepath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** The mirror: at most `TAIL_BYTES`, read from the far end. */
async function readTail(filepath: string, size: number): Promise<Buffer> {
  const length = Math.min(size, TAIL_BYTES);
  if (length === 0) return Buffer.alloc(0);

  const handle = await fs.promises.open(filepath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function fingerprintOf(size: number, head: Buffer, tail: Buffer): string {
  return crypto
    .createHash("sha256")
    .update(String(size))
    .update(head)
    .update(tail)
    .digest("hex")
    .slice(0, 32);
}

export interface ReadRequest {
  uri: string;
  name: string;
  position: number;
  gateway: SourceGateway;
  maxTextLength: number;
  allowNetworkAccess: boolean;
}

/**
 * A source, or null when there is nothing to open — an unreachable
 * device, a path that has moved, a url that will not answer. Null is
 * never an error here; the caller records a warning and reads the others.
 */
export async function readSource(request: ReadRequest): Promise<SourceEvidence | null> {
  const { uri, name, position, gateway, maxTextLength } = request;
  const sourceId = sourceIdFor(position, uri);

  const filepath = gateway.localPath(uri);
  if (filepath) return readFile({ sourceId, uri, name, position, filepath, maxTextLength });

  if (!request.allowNetworkAccess) return null;
  const body = await gateway.fetch(uri, WEB_MAX_BYTES);
  if (!body) return null;

  const text = once(async () => body.toString("utf8").slice(0, maxTextLength));
  return {
    sourceId,
    uri,
    name,
    position,
    kind: "web",
    // Deliberately the sniff and not the Content-Type: a jpeg served as
    // octet-stream is still a jpeg, and html sniffs to nothing, which is
    // the right answer — a page is placed by its url, not its type.
    mime: sniff(body),
    size: body.length,
    head: body,
    truncated: body.length >= WEB_MAX_BYTES,
    fingerprint: fingerprintOf(body.length, body.subarray(0, HEAD_BYTES), Buffer.alloc(0)),
    tail: once(async () => body.subarray(Math.max(0, body.length - TAIL_BYTES))),
    bytes: once(async () => body),
    text,
  };
}

interface FileRequest {
  sourceId: string;
  uri: string;
  name: string;
  position: number;
  filepath: string;
  maxTextLength: number;
}

async function readFile(request: FileRequest): Promise<SourceEvidence | null> {
  const { sourceId, uri, name, position, filepath, maxTextLength } = request;
  try {
    const stat = await fs.promises.stat(filepath);
    const head = await readHead(filepath, stat.size);

    // Held once a reader has needed the whole file, so a later `tail()`
    // slices memory instead of touching the disk again.
    let loaded: Buffer | undefined;
    const bytes = once(async () => {
      if (stat.size > MAX_WHOLE_FILE_BYTES) return null;
      loaded = await fs.promises.readFile(filepath);
      return loaded;
    });

    const tail = once(async () =>
      loaded ? loaded.subarray(Math.max(0, loaded.length - TAIL_BYTES)) : readTail(filepath, stat.size),
    );

    return {
      sourceId,
      uri,
      name,
      position,
      kind: "file",
      mime: sniff(head),
      size: stat.size,
      head,
      truncated: stat.size > HEAD_BYTES,
      fingerprint: fingerprintOf(stat.size, head, await tail()),
      tail,
      bytes,
      text: once(async () => head.toString("utf8").slice(0, maxTextLength)),
    };
  } catch {
    // Vanished between the resolve and the open, or unreadable. The same
    // answer as never having resolved at all.
    return null;
  }
}
