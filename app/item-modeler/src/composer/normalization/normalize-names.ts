// Authored by Karter Whitman using Claude Opus 5
// People's names, put in the order a person writes them.
//
// Library metadata files names for sorting — `Herbert, Frank` — and a
// reader wants them for reading. This survived the move to synthesis
// because it is *canonicalisation*, not interpretation: the fact does not
// change, only its spelling, and the rule is mechanical enough to state
// in one sentence. A stated fact transcribed from an OPF still deserves
// it.
//
// The risk is flipping something that was never inverted, so the rule is
// narrow: exactly one comma, plausible name-shaped parts on both sides,
// and a known suffix (`Jr.`, `III`) recognised rather than treated as a
// given name.

/** Generational and honorific suffixes that follow a surname, so
 * `King, Martin Luther, Jr.` is not read as two commas' worth of
 * inversion. */
const SUFFIX = /^(jr|sr|[ivx]{1,4}|phd|md|esq)\.?$/i;

/** Digits, an @, or a url mean this is not a person's name and must not
 * be reordered on the theory that it might be. */
const NOT_A_NAME = /[0-9@]|https?:/i;

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * `Surname, Given` → `Given Surname`, and everything else unchanged.
 *
 * Returns the input untouched whenever the shape is not clearly an
 * inversion. Leaving a name alone is always safe; reordering the wrong
 * one is not.
 */
export function normalizePersonName(raw: string): string {
  const value = collapseWhitespace(raw);
  if (value === "" || NOT_A_NAME.test(value)) return value;

  const parts = value.split(",").map((part) => part.trim());

  let suffix = "";
  if (parts.length === 3 && SUFFIX.test(parts[2] as string)) {
    suffix = parts[2] as string;
    parts.length = 2;
  }
  if (parts.length !== 2) return value;

  const [surname, given] = parts as [string, string];
  if (surname === "" || given === "") return value;

  // A "given name" of four words is a subtitle or an organisation, not a
  // first name; the comma is doing something else.
  if (given.split(" ").length > 3 || surname.split(" ").length > 3) return value;

  return collapseWhitespace(`${given} ${surname}${suffix ? ` ${suffix}` : ""}`);
}

/**
 * A field that may hold several people. Splits only on separators that
 * unambiguously divide names — a semicolon, or ` & `/` and ` — never a
 * bare comma, because a comma is how a single inverted name is written
 * and splitting on it turns one author into two.
 */
export function splitPeople(raw: string): string[] {
  return raw
    .split(/\s*;\s*|\s+&\s+|\s+\band\b\s+/i)
    .map((part) => normalizePersonName(part))
    .filter((part) => part !== "");
}

/** Case- and whitespace-insensitive identity — what "the same name" means
 * when a modeled value is compared against one already on the item. */
export function sameName(a: string, b: string): boolean {
  const flat = (value: string) =>
    normalizePersonName(value)
      .toLowerCase()
      .replace(/[.\s]+/g, " ")
      .trim();
  return flat(a) === flat(b);
}
