// Authored by Karter Whitman using Claude Opus 5
// ISBNs, and the check digit that is the whole point of this file.
//
// Looking like an isbn is not being one, and the difference is not
// academic: a scanned government document numbered `1978-04-13-00012`
// and a product code both present ten or thirteen digits in a row, and
// an archive's filename is full of numbers that are not identifiers at
// all. Verifying the check digit is cheap, catches nearly all of it, and
// is the reason `isbn` can be claimed from a filename without the claim
// being reckless.
//
// The spec asks for identifier checksum validation among its
// deterministic operations, and lists rejecting unsupported values as the
// quality metric that matters most. This is that rule at its sharpest:
// a value that fails here is discarded, never written and never guessed
// at.

/** Ten or thirteen digits, allowing the hyphens a printed isbn carries.
 * Anchored on non-digits so a longer number is not mined for a shorter
 * one hiding inside it. */
const ISBN_SHAPED = /(?<!\d)(\d[\d-]{8,17}[\dXx])(?!\d)/g;

function digitsOf(candidate: string): string {
  return candidate.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** ISBN-10: the weighted sum of all ten characters, mod 11. The final
 * character may be `X`, standing for ten — which is why this cannot be
 * done in integer arithmetic over the whole string. */
function isIsbn10(digits: string): boolean {
  if (digits.length !== 10) return false;
  let sum = 0;
  for (let at = 0; at < 10; at += 1) {
    const character = digits[at] as string;
    const value = character === "X" ? 10 : Number(character);
    if (Number.isNaN(value)) return false;
    // `X` is only legal in the check position.
    if (character === "X" && at !== 9) return false;
    sum += value * (10 - at);
  }
  return sum % 11 === 0;
}

/** ISBN-13: alternating weights of 1 and 3, mod 10. Same algorithm as
 * EAN-13, which is what an isbn-13 actually is. */
function isIsbn13(digits: string): boolean {
  if (digits.length !== 13 || /[^0-9]/.test(digits)) return false;
  let sum = 0;
  for (let at = 0; at < 13; at += 1) {
    sum += Number(digits[at]) * (at % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

export function isIsbn(candidate: string): boolean {
  const digits = digitsOf(candidate);
  return isIsbn10(digits) || isIsbn13(digits);
}

/**
 * Canonical form: digits only, and an isbn-10 promoted to its isbn-13
 * equivalent so two spellings of one identifier compare equal.
 *
 * Promotion matters for reconciliation more than for storage — a book
 * whose epub declares the 13 and whose filename carries the 10 is not two
 * sources disagreeing, and without this it would be recorded as a
 * conflict for the user to resolve between two forms of the same number.
 */
export function normalizeIsbn(candidate: string): string | null {
  const digits = digitsOf(candidate);
  if (isIsbn13(digits)) return digits;
  if (!isIsbn10(digits)) return null;

  const body = `978${digits.slice(0, 9)}`;
  let sum = 0;
  for (let at = 0; at < 12; at += 1) {
    sum += Number(body[at]) * (at % 2 === 0 ? 1 : 3);
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** The first verified isbn in a run of text, or null. Every candidate
 * shape is checked rather than the first one taken, because the shape is
 * common and the checksum is what separates the real from the numeric. */
export function findIsbn(text: string): string | null {
  for (const match of text.matchAll(ISBN_SHAPED)) {
    const candidate = match[1];
    if (candidate && isIsbn(candidate)) return normalizeIsbn(candidate);
  }
  return null;
}

/**
 * An isbn out of a list of identifiers, as an epub's `dc:identifier`
 * elements arrive — a book commonly declares several, of which one is a
 * uuid, one a url and one the isbn. Prefixes like `urn:isbn:` and
 * `ISBN ` are stripped before checking.
 */
export function isbnFrom(identifiers: string[]): string | null {
  for (const identifier of identifiers) {
    const stripped = identifier.replace(/^\s*(urn:)?isbn[:\s-]*/i, "");
    const found = findIsbn(stripped);
    if (found) return found;
  }
  return null;
}
