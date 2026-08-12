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
// [pinned here] Local files only in this pass. `openProbe` returns null
// for a web uri so a web probe fits later, but implementing one now would
// mean fetching a page here *and* again in derivations.ts — a regression
// against today's single fetch. The follow-up that adds web absorbs that
// scrape rather than racing it.
import crypto from "node:crypto";
import fs from "node:fs";
import { sha256File } from "../hash.js";
import { resolveExistingFile } from "../resolver.js";

/** Enough for a zip's first local header, an image's signature block, and
 * a markdown file's opening section — the things classification reads. */
const HEAD_BYTES = 64 * 1024;

export interface Probe {
  readonly uri: string;
  readonly filepath: string;
  readonly size: number;
  /** The first `HEAD_BYTES`, or the whole file when it is smaller. */
  readonly head: Buffer;

  /** Sniffed from `head` — what the bytes say they are, which is not
   * always what the extension claims. Null when nothing matched. */
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
  if (ascii(head, ZIP_HEADER_BYTES, nameEnd) !== "mimetype") return "application/zip";

  // Stored rather than deflated, so the entry's bytes are the media type
  // itself and its compressed size is that string's length. A zero size
  // means a data descriptor, which the OCF spec forbids here — treat
  // anything unexpected as a plain zip rather than trusting it.
  if (compressedSize === 0 || compressedSize > EPUB_MIMETYPE_MAX) return "application/zip";
  const start = nameEnd + extraLength;
  const declared = ascii(head, start, start + compressedSize).trim();
  return /^[\w.+-]+\/[\w.+-]+$/.test(declared) ? declared : "application/zip";
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

/** Runs `work` once and hands every later caller the same promise. */
function once<T>(work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= work());
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * The handle for a resource, or null when there is no local file behind it
 * — a web uri, an unreachable device, a path that has moved. Callers treat
 * a null probe the way they already treat a missing derivation: not an
 * error, just less to go on.
 */
export async function openProbe(uri: string): Promise<Probe | null> {
  const filepath = resolveExistingFile(uri);
  if (!filepath) return null;

  try {
    const stat = await fs.promises.stat(filepath);
    const head = await readHead(filepath, stat.size);

    let loaded: Buffer | undefined;
    const bytes = once(async () => (loaded = await fs.promises.readFile(filepath)));

    return {
      uri,
      filepath,
      size: stat.size,
      head,
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
