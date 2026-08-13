// Authored by Karter Whitman using Claude Opus 5
// One open per resource. Classification and extraction both need to look
// at the same file, and before this they each opened it themselves — an
// epub was read end to end twice on the way in, once streamed for its
// hash and once buffered for its zip.
//
// A probe is a handle rather than a snapshot, because a snapshot has to
// decide up front how deep to go: parse every zip it meets, or under-serve
// whoever needed the parse and watch them reopen the file anyway. So the
// cost model is readable off the interface instead — `head` is bounded and
// always paid, `hash()` streams and never buffers, and `bytes()` (the one
// that could hold half a gigabyte) is reached only by a reader that has
// already established the file is worth loading.
//
// A web resource is probed the same way, and for the same reason: the
// link scrape used to fetch a page, read four og: tags off it and throw
// the parse away, so nothing downstream could ask the page anything else
// without fetching it again. Now the fetch happens once here and both
// the metadata and the classifier read the same body.
import crypto from "node:crypto";
import fs from "node:fs";
import { deviceOf } from "@index/database";
import { sha256File } from "../hash.js";
import { previewFetch, withPreviewTimeout } from "../previews/fetch.js";
import { resolveExistingFile } from "../resolver.js";

/** Enough for a zip's first local header, an image's signature block, and
 * a markdown file's opening section — the things classification reads. */
const HEAD_BYTES = 64 * 1024;

/**
 * A pdf keeps its trailer — and with it the pointer to everything the
 * file says about itself — at the *end*, which is the one place a head
 * can never reach. Bigger than the head because the objects the trailer
 * points at trail behind it, and generous enough that a producer which
 * writes its metadata a few objects earlier is still caught; still a
 * fixed price, so a 400 MB scan costs a quarter megabyte to read rather
 * than 400 MB.
 */
const TAIL_BYTES = 256 * 1024;

/** PRODUCT-SPEC §2.4: link and meta tags live in <head>, so the rest of a
 * page is never needed and an enormous one can't hang resource creation. */
const WEB_MAX_BYTES = 1_000_000;

export interface Probe {
  readonly uri: string;
  /** Which kind of thing was opened. Callers that mean something by the
   * difference — a content hash is a *file's* identity, not a page's —
   * branch on this rather than on `filepath` being null. */
  readonly kind: "file" | "web";
  readonly filepath: string | null;
  readonly size: number;
  /** For a file, its first `HEAD_BYTES`. For a page, the body up to
   * `WEB_MAX_BYTES` — the whole of what was fetched, since a page is
   * read to be parsed rather than skimmed for a signature. */
  readonly head: Buffer;

  /**
   * The file's last `TAIL_BYTES`, for the formats that keep their
   * self-description at the end rather than the beginning. Bounded like
   * `head` and paid only when asked — a second small read of an open
   * file, never the whole of it.
   *
   * For a page, the end of what was fetched, which is the end of the
   * resource only when it fitted under the cap. A reader that meets a
   * truncated body simply finds no trailer there, which is the same
   * answer it gives for a file that never had one.
   */
  tail(): Promise<Buffer>;

  /** What the bytes say they are, which is not always what the extension
   * claims — nor what a server's Content-Type claims, which is why this
   * is sniffed for pages too. Null when nothing matched, including for
   * ordinary html: that a page is html tells the format ladder nothing
   * it doesn't already know from the url. */
  mime(): Promise<string | null>;
  text(): Promise<string>;
  bytes(): Promise<Buffer>;
  hash(): Promise<string>;
}

function startsWith(head: Buffer, bytes: number[]): boolean {
  return bytes.length <= head.length && bytes.every((byte, at) => head[at] === byte);
}

function ascii(head: Buffer, start: number, end: number): string {
  return head.subarray(start, end).toString("latin1");
}

/** Zip's local file header: a 4-byte signature, then 26 more bytes before
 * the filename begins. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const ZIP_HEADER_BYTES = 30;
const EPUB_MIMETYPE_MAX = 128; // a media type, not a payload
export const EPUB_MIME = "application/epub+zip";

/**
 * An epub is a zip whose *first* entry is an uncompressed file called
 * `mimetype` holding the media type — required by the OCF spec precisely
 * so a reader can identify one without unzipping it. That puts the answer
 * at a fixed offset inside the first 64 bytes of every conformant file,
 * which is how a mis-named `.zip` gets caught and an `.epub` that is not
 * one gets turned away.
 */
function declaredZipMime(head: Buffer): string | null {
  if (!startsWith(head, ZIP_SIGNATURE) || head.length < ZIP_HEADER_BYTES) return null;

  const compressedSize = head.readUInt32LE(18);
  const nameLength = head.readUInt16LE(26);
  const extraLength = head.readUInt16LE(28);
  const nameEnd = ZIP_HEADER_BYTES + nameLength;

  // A first entry that isn't `mimetype` is a definite no: an OCF
  // container is required to lead with one, so this is an ordinary zip
  // however it happens to be named.
  if (ascii(head, ZIP_HEADER_BYTES, nameEnd) !== "mimetype") return "application/zip";

  // Conformant files store that entry uncompressed, so its bytes are the
  // media type and its compressed size is that string's length.
  const start = nameEnd + extraLength;
  const readable = compressedSize > 0 && compressedSize <= EPUB_MIMETYPE_MAX;
  const declared = readable ? ascii(head, start, start + compressedSize).trim() : "";
  if (/^[\w.+-]+\/[\w.+-]+$/.test(declared)) return declared;

  // Named `mimetype` but unreadable — deflated, which the spec forbids
  // but real files do. Nothing else puts a file of exactly that name
  // first, so the container is what it looks like even when its own
  // declaration can't be read; guessing epub here beats demoting a real
  // book to a plain file over a packaging mistake.
  return EPUB_MIME;
}

/** Magic numbers, first match wins. Deliberately short: this exists to
 * feed the format ladder and the classifier, not to be libmagic. */
function sniff(head: Buffer): string | null {
  const zip = declaredZipMime(head);
  if (zip) return zip;

  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"

  const gif = ascii(head, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";

  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  // An ISO base media container: 4 bytes of length, "ftyp", then a brand.
  if (ascii(head, 4, 8) === "ftyp" && ["heic", "heix", "mif1"].includes(ascii(head, 8, 12))) {
    return "image/heic";
  }

  return null;
}

/** Reads at most `HEAD_BYTES` — an fd and a partial read, not `readFile`,
 * so probing a video costs 64 KB rather than the video. */
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

/** The mirror of `readHead`: at most `TAIL_BYTES`, read from the far end
 * with the same single fd and partial read. */
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

/** Runs `work` once and hands every later caller the same promise. */
function once<T>(work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= work());
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Reads at most `WEB_MAX_BYTES` of a response body, then hangs up. */
async function readCapped(response: Response): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let read = 0;
  while (read < WEB_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    read += value.byteLength;
  }
  void reader.cancel().catch(() => {});
  return Buffer.concat(chunks, Math.min(read, WEB_MAX_BYTES));
}

/**
 * The page behind a url, fetched once. Null when it can't be reached —
 * no network, a refusal, a timeout — which callers already handle, since
 * that was every web resource until now.
 */
async function openWebProbe(uri: string): Promise<Probe | null> {
  let body: Buffer;
  try {
    body = await withPreviewTimeout(async (signal) => {
      const response = await previewFetch(uri, signal);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return readCapped(response);
    });
  } catch {
    return null;
  }

  return {
    uri,
    kind: "web",
    filepath: null,
    size: body.length,
    head: body,
    tail: once(async () => body.subarray(Math.max(0, body.length - TAIL_BYTES))),
    // Deliberately the sniff and not the Content-Type header: servers
    // are careless with it, and a jpeg served as octet-stream is still a
    // jpeg. Html sniffs to nothing, which is the right answer — the url
    // is what places a page, not its media type.
    mime: once(async () => sniff(body)),
    text: once(async () => body.toString("utf8")),
    bytes: once(async () => body),
    hash: once(async () => sha256Buffer(body)),
  };
}

/**
 * The handle for a resource, or null when there is nothing to open — an
 * unreachable device, a path that has moved, a url that won't answer.
 * Callers treat a null probe the way they already treat a missing
 * derivation: not an error, just less to go on.
 */
export async function openProbe(uri: string): Promise<Probe | null> {
  if (deviceOf(uri) === "web") return openWebProbe(uri);

  const filepath = resolveExistingFile(uri);
  if (!filepath) return null;

  try {
    const stat = await fs.promises.stat(filepath);
    const head = await readHead(filepath, stat.size);

    let loaded: Buffer | undefined;
    const bytes = once(async () => (loaded = await fs.promises.readFile(filepath)));

    return {
      uri,
      kind: "file",
      filepath,
      size: stat.size,
      head,
      // Slices what is already in memory when a reader has loaded the
      // file, so asking for the end of an epub nobody needed to open
      // costs a small read and asking for the end of one that was
      // unzipped costs nothing.
      tail: once(async () =>
        loaded
          ? loaded.subarray(Math.max(0, loaded.length - TAIL_BYTES))
          : readTail(filepath, stat.size),
      ),
      mime: once(async () => sniff(head)),
      text: once(async () => head.toString("utf8")),
      bytes,
      // Streams when nobody has needed the whole file, so hashing a video
      // never buffers one — but hashes what is already in memory when a
      // reader has loaded it, so an epub is not read a second time just
      // to sign the bytes its extractor was already holding. That only
      // pays off if hashing happens after extraction, which is why
      // intake.ts observes in that order.
      hash: once(async () => (loaded ? sha256Buffer(loaded) : sha256File(filepath))),
    };
  } catch {
    // Vanished between the existence check and the open, or unreadable.
    // The same answer as never having resolved.
    return null;
  }
}
