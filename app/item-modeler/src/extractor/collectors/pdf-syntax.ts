// Authored by Karter Whitman using Claude Opus 5
// Just enough PDF object syntax to find what a file says about itself.
//
// Parsed directly rather than by taking a dependency, because the job is
// narrow and the libraries are not: everything below exists to walk from
// a trailer to a dictionary and decode the strings inside it. Nothing
// here renders a page, and nothing here needs to.
//
// The parsing is structural rather than regex-based for one specific
// reason: a PDF string is delimited by parentheses that may be *nested
// and escaped*, so `\(([^)]*)\)` finds the wrong end of any title
// containing a bracket. Counting depth is barely more code and is simply
// correct.
import zlib from "node:zlib";

export type Dict = Record<string, string>;

export interface PdfObject {
  id: number;
  /** The object's dictionary, raw. Empty when it has none. */
  dict: Dict;
  /** Byte offsets of the stream payload inside the region, when present. */
  stream?: { from: number; to: number };
}

const WHITESPACE = new Set([" ", "\t", "\r", "\n", "\f", "\0"]);
const DELIMITER = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

function isRegular(character: string | undefined): boolean {
  return character !== undefined && !WHITESPACE.has(character) && !DELIMITER.has(character);
}

function skipSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length) {
    const character = text[at];
    if (character !== undefined && WHITESPACE.has(character)) {
      at += 1;
      continue;
    }
    // A comment runs to the end of the line and can sit anywhere a token
    // can, including between a key and its value.
    if (character === "%") {
      while (at < text.length && text[at] !== "\n" && text[at] !== "\r") at += 1;
      continue;
    }
    break;
  }
  return at;
}

function endOfToken(text: string, from: number): number {
  let at = from;
  while (at < text.length && isRegular(text[at])) at += 1;
  return at;
}

/** A literal string: parentheses nest, and a backslash escapes the next
 * character including a parenthesis. */
function endOfLiteral(text: string, from: number): number {
  let at = from + 1;
  let depth = 1;
  while (at < text.length && depth > 0) {
    const character = text[at];
    if (character === "\\") {
      at += 2;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    at += 1;
  }
  return at;
}

function endOfBracketed(text: string, from: number, open: string, close: string): number {
  const double = open === "<";
  let at = from + (double ? 2 : 1);
  let depth = 1;
  while (at < text.length && depth > 0) {
    // Skip strings wholesale — a `>>` inside one is text, not a close.
    if (text[at] === "(") {
      at = endOfLiteral(text, at);
      continue;
    }
    if (double) {
      if (text.startsWith("<<", at)) {
        depth += 1;
        at += 2;
        continue;
      }
      if (text.startsWith(">>", at)) {
        depth -= 1;
        at += 2;
        continue;
      }
      at += 1;
      continue;
    }
    if (text[at] === open) depth += 1;
    if (text[at] === close) depth -= 1;
    at += 1;
  }
  return at;
}

/** One value, whatever kind, returned raw with the offset after it. */
export function readValue(text: string, at: number): { raw: string; end: number } | null {
  const start = skipSpace(text, at);
  if (start >= text.length) return null;
  const character = text[start];

  if (character === "(") {
    const end = endOfLiteral(text, start);
    return { raw: text.slice(start, end), end };
  }
  if (character === "<" && text[start + 1] === "<") {
    const end = endOfBracketed(text, start, "<", ">");
    return { raw: text.slice(start, end), end };
  }
  if (character === "<") {
    const end = text.indexOf(">", start) + 1;
    if (end === 0) return null;
    return { raw: text.slice(start, end), end };
  }
  if (character === "[") {
    const end = endOfBracketed(text, start, "[", "]");
    return { raw: text.slice(start, end), end };
  }
  if (character === "/") {
    const end = endOfToken(text, start + 1);
    return { raw: text.slice(start, end), end };
  }

  // A bare token: a number, a keyword, or the head of an `N G R`
  // reference — which has to be recognised here, because the two numbers
  // and the `R` are three tokens that mean one value.
  const end = endOfToken(text, start);
  const token = text.slice(start, end);
  if (/^\d+$/.test(token)) {
    const second = skipSpace(text, end);
    const secondEnd = endOfToken(text, second);
    const generation = text.slice(second, secondEnd);
    const third = skipSpace(text, secondEnd);
    const thirdEnd = endOfToken(text, third);
    if (/^\d+$/.test(generation) && text.slice(third, thirdEnd) === "R") {
      return { raw: `${token} ${generation} R`, end: thirdEnd };
    }
  }
  return { raw: token, end };
}

/** `<< /Key value … >>` at `from`, as a flat map of raw values. */
export function parseDict(text: string, from: number): Dict | null {
  if (!text.startsWith("<<", from)) return null;
  const dict: Dict = {};
  let at = from + 2;

  while (at < text.length) {
    at = skipSpace(text, at);
    if (text.startsWith(">>", at)) break;
    if (text[at] !== "/") {
      // Not a key where one belongs: the dictionary is malformed or we
      // are not where we thought. Take what was read rather than throw.
      const skipped = readValue(text, at);
      if (!skipped || skipped.end <= at) break;
      at = skipped.end;
      continue;
    }
    const keyEnd = endOfToken(text, at + 1);
    const key = decodeName(text.slice(at, keyEnd));
    const value = readValue(text, keyEnd);
    if (!value) break;
    dict[key] = value.raw;
    at = value.end;
  }
  return dict;
}

/** `/Sub#20type` → `Subtype`. A name escapes any character as `#` and
 * two hex digits, and real files use it for spaces and for `#` itself. */
export function decodeName(raw: string): string {
  return raw
    .replace(/^\//, "")
    .replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "(": "(",
  ")": ")",
  "\\": "\\",
};

/** A literal string's bytes, with escapes resolved. Octal escapes carry
 * the high bytes of a UTF-16 title, so they cannot be skipped. */
function unescapeLiteral(body: string): Buffer {
  const bytes: number[] = [];
  let at = 0;
  while (at < body.length) {
    const character = body[at];
    if (character !== "\\") {
      bytes.push(body.charCodeAt(at));
      at += 1;
      continue;
    }
    const next = body[at + 1];
    if (next === undefined) break;
    if (next in ESCAPES) {
      bytes.push((ESCAPES[next] as string).charCodeAt(0));
      at += 2;
      continue;
    }
    // A backslash before a newline is a line continuation: both go.
    if (next === "\n") {
      at += 2;
      continue;
    }
    if (next === "\r") {
      at += body[at + 2] === "\n" ? 3 : 2;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(at + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      at += 1 + octal[0].length;
      continue;
    }
    bytes.push(next.charCodeAt(0));
    at += 2;
  }
  return Buffer.from(bytes);
}

/**
 * A PDF text string, in whichever of its encodings it was written.
 *
 * The UTF-16 case is why this cannot be a `toString()`. PDFDocEncoding
 * predates unicode, so anything outside latin-1 is written as UTF-16BE
 * with a byte-order mark — and a producer that writes an accented author
 * name will use it while the same file's other strings stay one-byte.
 */
export function decodeText(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).swap16().toString("utf16le");
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }
  return bytes.toString("latin1");
}

/** A raw dictionary value as readable text, or undefined when it is not
 * a string at all. */
export function asText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw.startsWith("(")) {
    const text = decodeText(unescapeLiteral(raw.slice(1, -1))).trim();
    return text === "" ? undefined : text;
  }
  if (raw.startsWith("<") && !raw.startsWith("<<")) {
    const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, "");
    const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
    const text = decodeText(Buffer.from(padded, "hex")).trim();
    return text === "" ? undefined : text;
  }
  return undefined;
}

/** `12 0 R` → 12. */
export function asRef(raw: string | undefined): number | undefined {
  const match = raw ? /^(\d+)\s+\d+\s+R$/.exec(raw) : null;
  return match?.[1] ? Number(match[1]) : undefined;
}

export function nameOf(raw: string | undefined): string | undefined {
  return raw?.startsWith("/") ? decodeName(raw) : undefined;
}

const OBJECT_HEADER = /(\d+)\s+\d+\s+obj\b/g;

/**
 * Every object whose header appears in this region.
 *
 * A region rather than a file, because the parts of a PDF that describe
 * it are at the two ends: the trailer is the last thing written, and the
 * objects it points at are usually just before it. Scanning a fixed
 * window at each end finds them without the file's size entering into
 * the cost.
 */
export function scanObjects(text: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  OBJECT_HEADER.lastIndex = 0;

  for (const match of text.matchAll(OBJECT_HEADER)) {
    const id = Number(match[1]);
    const from = (match.index ?? 0) + match[0].length;
    const bodyStart = skipSpace(text, from);
    const dict = text.startsWith("<<", bodyStart) ? parseDict(text, bodyStart) : null;

    const object: PdfObject = { id, dict: dict ?? {} };

    const streamAt = text.indexOf("stream", bodyStart);
    const endAt = text.indexOf("endobj", bodyStart);
    if (streamAt !== -1 && (endAt === -1 || streamAt < endAt)) {
      // `stream` is followed by CRLF or LF, never by CR alone.
      let payload = streamAt + "stream".length;
      if (text[payload] === "\r") payload += 1;
      if (text[payload] === "\n") payload += 1;
      const endstream = text.indexOf("endstream", payload);
      if (endstream !== -1) object.stream = { from: payload, to: endstream };
    }
    objects.set(id, object);
  }
  return objects;
}

/** Every `trailer` dictionary in the region, last written first — later
 * trailers supersede earlier ones in an incrementally updated file. */
export function scanTrailers(text: string): Dict[] {
  const dicts: Dict[] = [];
  let at = text.indexOf("trailer");
  while (at !== -1) {
    const dictAt = skipSpace(text, at + "trailer".length);
    const dict = parseDict(text, dictAt);
    if (dict) dicts.push(dict);
    at = text.indexOf("trailer", at + 1);
  }
  return dicts.reverse();
}

const MAX_INFLATED = 8 * 1024 * 1024;

/**
 * A stream's contents, inflated when it is deflated.
 *
 * Bounded, because an inflate is the one operation here whose output size
 * is chosen by the file rather than by this module — a small object can
 * declare an enormous expansion, and a metadata read is not worth a
 * gigabyte of memory.
 */
export function decodeStream(text: string, object: PdfObject): string | null {
  if (!object.stream) return null;
  const raw = text.slice(object.stream.from, object.stream.to);
  const filter = object.dict["Filter"];

  if (!filter) return raw;
  if (!filter.includes("FlateDecode")) return null;

  try {
    const inflated = zlib.inflateSync(Buffer.from(raw, "latin1"), { maxOutputLength: MAX_INFLATED });
    return inflated.toString("latin1");
  } catch {
    // A raw-deflate stream, which some producers write in place of zlib.
    try {
      const inflated = zlib.inflateRawSync(Buffer.from(raw, "latin1"), {
        maxOutputLength: MAX_INFLATED,
      });
      return inflated.toString("latin1");
    } catch {
      return null;
    }
  }
}
