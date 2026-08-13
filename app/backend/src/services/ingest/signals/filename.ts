// Authored by Karter Whitman using Claude Opus 5
// What a file's *name* says about the work inside it.
//
// This exists because of a book. "The Buddha in the Machine" declares
// nothing about itself internally — no Title, no Author, no Keywords, no
// XMP packet — and the one thing it does declare, a creation date, is the
// date somebody re-wrapped the scan in 2019, five years after Yale
// published it. Reading the file gets you two fields and a wrong year.
// The name it was saved under gets you five, correctly:
//
//   R. John Williams - The Buddha in the Machine_ Art, Technology, and the
//   Meeting of East and West (2014, Yale University Press) [10.12987_9780300206579]
//
// So the filename is a source, not a fallback, and where the two disagree
// it wins (sources.ts holds that order). The justification is not that it
// is more often right — it is that the two are written by different
// hands. An Info dictionary is what a *tool* wrote about a *file*; a name
// like that is what a person or a curated archive wrote about the *work*.
// For anything that came through a library, the human is the better
// witness, and a re-wrapper's timestamp is not evidence about a book.
//
// The whole danger of that rule is a name with no structure at all, so
// the guard is the point of this module: `title` and `author` are claimed
// only when a recognised *shape* produced them. `IMG_2024.pdf` and
// `resume - Karter Whitman.pdf` must never assert an author, and the
// tests that matter here are the ones asserting silence.
import type { Observation } from "../extract.js";

/** Trailing marks the archives add, removed before anything is read: they
 * are about the copy, not the work. */
const SOURCE_SUFFIX = /\s*-\s*(libgen\.(li|rs|is|st)|annas?[-\s]?archive|z-?lib(rary)?)\s*$/i;
const COMPRESSION_SUFFIX = /[_-](compress(ed)?|ocr|scan(ned)?|retail|v\d+)$/i;

/** A doi as a filesystem writes it: `/` is not allowed in a name, so
 * archives substitute `_`. Both spellings appear in the wild, sometimes
 * in the same folder. */
const DOI = /\b(10\.\d{4,9})[/_]([^\s\][()]+)/;

/** Ten or thirteen digits in a row, allowing the hyphens a printed isbn
 * carries. Anchored on non-digits so a longer number is not mined for a
 * shorter one inside it — every candidate is then checked (`isIsbn`),
 * because looking like an isbn is not being one. */
const ISBN = /(?<!\d)(\d[\d-]{8,17}[\dXx])(?!\d)/g;

/**
 * A year, and only where a name *annotates* one: opening a parenthesis
 * or a bracket, as `(2014)` and `(2014, Yale University Press)` both do.
 *
 * A bare four-digit run is not enough and the corpus says why —
 * `IMG_2024.pdf` is frame 2024 of a camera roll, `DSC_1999` is not from
 * 1999, and dating either from its name would be inventing a fact where
 * there is only a counter. Brackets are how a person says "this number
 * is the year", so they are what is trusted.
 */
const YEAR = /[([](1[5-9]\d{2}|20[0-4]\d)(?=[,\s)\]])/;

/**
 * Whether a run of digits is an isbn rather than a number of the right
 * length, by the check digit the standard puts there for exactly this
 * purpose — mod 11 over weights 10…1 for a 10, mod 10 over alternating
 * 1/3 for a 13.
 *
 * Not fussiness. `cia-rdp96-00788r001900760001-9.pdf` is a real file in
 * a real library, and its document number reads as thirteen digits with
 * hyphens in the right places; without the check it becomes that item's
 * isbn, and a wrong identifier is worse than no identifier because
 * nothing downstream can tell it is wrong.
 */
function isIsbn(digits: string): boolean {
  if (digits.length === 13) {
    if (!/^97[89]/.test(digits)) return false;
    const sum = [...digits].reduce(
      (total, digit, at) => total + Number(digit) * (at % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0;
  }
  if (digits.length === 10) {
    const sum = [...digits].reduce(
      (total, digit, at) => total + (digit.toUpperCase() === "X" ? 10 : Number(digit)) * (10 - at),
      0,
    );
    return sum % 11 === 0;
  }
  return false;
}

/**
 * `Author - Title (Year, Publisher) [identifiers]` — what libgen, Anna's
 * Archive and their mirrors write, and the only pattern here that is
 * unambiguous enough to be trusted about *which side is the author*. The
 * parenthesised group is what makes it so: nothing else in casual naming
 * puts a year and a publisher together in brackets.
 */
const LIBGEN = /^(.+?)\s+-\s+(.+?)\s*\((1[5-9]\d{2}|20[0-4]\d)\s*,\s*([^)]+)\)/;

/** `Author - Title (Year)` — the same shape with no publisher named. */
const AUTHOR_TITLE_YEAR = /^(.+?)\s+-\s+(.+?)\s*\((1[5-9]\d{2}|20[0-4]\d)\)\s*$/;

/**
 * Calibre's layout, which states the author in the *path* rather than in
 * the name: `…/Author Name/Title (1234)/Title - Author.ext`. The
 * directory is the claim; the file underneath it merely repeats it.
 */
const CALIBRE_DIRECTORY = /\/([^/]+)\/([^/]+?)\s*\(\d+\)\/[^/]+$/;

/** Libgen writes a title's colon as an underscore, because a colon is not
 * legal in a filename on every platform it serves. */
function restoreColons(text: string): string {
  return text.replace(/_\s+/g, ": ").replace(/_/g, " ");
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s*[,;:-]\s*$/, "").trim();
}

function basenameOf(uri: string): string {
  const withoutQuery = uri.split(/[?#]/, 1)[0] ?? uri;
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

function withoutExtension(basename: string): string {
  const dot = basename.lastIndexOf(".");
  // A name that is *only* an extension, or whose dot sits at the front,
  // has no extension to strip.
  return dot <= 0 ? basename : basename.slice(0, dot);
}

/** The isbn among whatever digit runs a name holds, preferring a 13 —
 * a name carrying both prints them 13 first, and the 13 is the one in
 * print today. Same shape as book.ts's rule, over a different haystack
 * and with the check digit actually verified. */
function isbnIn(text: string): string | undefined {
  const found = [...text.matchAll(ISBN)]
    .map((match) => (match[0] as string).replace(/-/g, ""))
    .filter(isIsbn);
  return found.find((digits) => digits.length === 13) ?? found[0];
}

function yearIn(text: string): string | undefined {
  return YEAR.exec(text)?.[1];
}

/**
 * The shape a name was written in, when it was written in one at all.
 * Null is the common and correct answer: most files are named by a
 * person in a hurry, and `Egan-Learning-to-Be-Me.pdf` genuinely does not
 * say which half is the author.
 */
function structureOf(
  stem: string,
  path: string,
): { title: string; author: string; publisher?: string } | null {
  const libgen = LIBGEN.exec(stem);
  if (libgen) {
    return {
      author: tidy(libgen[1] as string),
      title: tidy(restoreColons(libgen[2] as string)),
      publisher: tidy(libgen[4] as string),
    };
  }

  const authored = AUTHOR_TITLE_YEAR.exec(stem);
  if (authored) {
    return {
      author: tidy(authored[1] as string),
      title: tidy(restoreColons(authored[2] as string)),
    };
  }

  // Calibre: the author is the folder two levels up, so the ambiguity
  // that defeats `A - B` is settled by where the file sits.
  const calibre = CALIBRE_DIRECTORY.exec(path);
  if (calibre) {
    return { author: tidy(calibre[1] as string), title: tidy(calibre[2] as string) };
  }

  return null;
}

/**
 * What the name and path say, as observations in the same vocabulary the
 * file readers use (`title`, `author`, `published`, `publisher`, `isbn`,
 * `doi`) so the join treats both alike.
 *
 * Two tiers, and the split is the safety rule:
 *
 * - **Identifiers are read from any name**, because they carry their own
 *   proof: a doi is shaped unmistakably, and an isbn is checked against
 *   its check digit before it is believed. Neither needs the name around
 *   it to be structured.
 * - **Title, author and year are read only from a recognised shape.**
 *   These are the claims that would be *wrong* rather than merely
 *   absent, and a wrong author or a wrong year is worse than none — it
 *   is a fact the user now has to notice and delete.
 *
 * So `202._mind_wandering.pdf` and `IMG_2024.pdf` yield nothing at all,
 * `web-browser-engineering-9780198913870-…` yields only its isbn, and
 * `… (2014, Yale University Press) [10.12987_9780300206579]` yields all
 * five.
 */
export function fromFilename(uri: string): Observation[] {
  const path = decodeURIComponent(uri);
  const basename = basenameOf(path);
  const stem = tidy(
    withoutExtension(basename).replace(SOURCE_SUFFIX, "").replace(COMPRESSION_SUFFIX, ""),
  );
  if (stem === "") return [];

  const observations: Observation[] = [];
  const say = (key: string, value: string | undefined, kind: Observation["kind"] = "string") => {
    if (value !== undefined && value !== "") {
      observations.push({ key, value, kind, source: "filename" });
    }
  };

  const structure = structureOf(stem, path);
  if (structure) {
    say("title", structure.title);
    say("author", structure.author);
    say("publisher", structure.publisher);
  }

  // A year is a date the moment it is one, and a bare year means the
  // first of January the same way book.ts's reader already decides it —
  // the two must agree, or the same book dated from its file and from
  // its name would sort into two different places.
  const year = yearIn(stem);
  if (year) say("published", `${year}-01-01`, "date");

  const doi = DOI.exec(stem);
  if (doi) say("doi", `${doi[1]}/${doi[2]}`);

  say("isbn", isbnIn(stem));

  return observations;
}
