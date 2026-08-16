// Authored by Karter Whitman using Claude Opus 5
// Dates, canonicalised to what Index's `date` field kind stores.
//
// Two rules do most of the work here, and both come from being wrong
// about real files rather than from thinking.
//
// A **bare four-digit run is not a year**. `IMG_2024.pdf` is frame 2024
// of a camera roll and `DSC_1999` is not from 1999, so a year is read
// only where something in the text annotates it as one — a parenthesis, a
// bracket, or a full date around it. The cost of the rule is missing a
// year occasionally; the cost of not having it is confidently dating a
// photograph to its filename.
//
// And **precision is preserved rather than invented**. A source that said
// `1965` gets `1965`, not `1965-01-01`. Padding it out reads as a
// publication day the source never claimed, and worse, makes two records
// of the same book disagree when one of them knew the month.

/** A year in a plausible range for a published work — narrow enough that
 * a page count, a street number or a product code does not read as one. */
const PLAUSIBLE_YEAR = /^(1[4-9]\d\d|20\d\d|21\d\d)$/;

/** A year only where the text *annotates* it: `(2014)`, `[1965]`, or
 * `(2014, Yale University Press)`. The opening bracket is the signal. */
const ANNOTATED_YEAR = /[([](\d{4})(?=[\s,\])])/;

/** A PDF date: `D:YYYYMMDDHHmmSS` with an optional offset, and every
 * component after the year optional in practice however the spec reads. */
const PDF_DATE = /^D?:?(\d{4})(\d{2})?(\d{2})?/;

/** ISO, or the front of one — an epub commonly writes a full timestamp
 * where only the date is meaningful. */
const ISO_DATE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/;

function plausibleYear(year: string): boolean {
  return PLAUSIBLE_YEAR.test(year);
}

/** Assemble only the components that were actually present. */
function assemble(year: string, month?: string, day?: string): string | null {
  if (!plausibleYear(year)) return null;
  if (!month || month === "00") return year;
  if (Number(month) < 1 || Number(month) > 12) return year;
  if (!day || day === "00") return `${year}-${month}`;
  if (Number(day) < 1 || Number(day) > 31) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/**
 * A stated date, canonicalised. Handles ISO and the PDF `D:` form, which
 * between them cover what an epub package document and a PDF Info
 * dictionary write. Returns null rather than guessing.
 */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;

  const pdf = value.startsWith("D:") ? PDF_DATE.exec(value) : null;
  if (pdf?.[1]) return assemble(pdf[1], pdf[2], pdf[3]);

  const iso = ISO_DATE.exec(value);
  if (iso?.[1]) return assemble(iso[1], iso[2], iso[3]);

  // A bare year, but only where the whole value is one — which is a
  // statement that this is the date, not a number found inside prose.
  if (/^\d{4}$/.test(value) && plausibleYear(value)) return value;

  return null;
}

/**
 * A year found *inside* running text — a filename, a title line. Far
 * stricter than `normalizeDate`, because here the four digits have to
 * earn the reading rather than having been offered as a date.
 */
export function findYear(text: string): string | null {
  const match = ANNOTATED_YEAR.exec(text);
  const year = match?.[1];
  return year && plausibleYear(year) ? year : null;
}

/**
 * Do two dates describe the same fact at different precision?
 *
 * `1965` and `1965-08-01` are one publication recorded twice, not a
 * disagreement — so reconciliation treats them as compatible and keeps
 * the more precise one, rather than raising a conflict the user would
 * have to resolve between two correct answers.
 */
export function datesAgree(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer.startsWith(shorter);
}
