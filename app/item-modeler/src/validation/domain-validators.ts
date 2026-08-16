// Authored by Karter Whitman using Claude Opus 5
// Per-field sanity: is this a plausible value for what it claims to be?
//
// Deliberately separate from normalisation, which asks "what is the
// canonical spelling of this?" Validation asks "should this be written at
// all?", and answers no by discarding — the spec is explicit that a
// candidate failing validation is dropped or quarantined with a warning,
// never written in whatever form it arrived.
//
// Every rule here earns its place by catching something real. None of
// them are shaped like "the value looks odd"; each names a specific way a
// wrong value gets produced.
import { isIsbn } from "../normalization/normalize-identifiers.js";
import type { FieldHint } from "../normalization/normalize-value.js";

export interface Verdict {
  ok: boolean;
  /** Why not, in words that would help someone reading a warning. */
  reason?: string;
}

const OK: Verdict = { ok: true };

/** A title that is really a filesystem path, a url, or a producer's
 * banner. All three come from tools filling the Title field with whatever
 * they had to hand. */
const NOT_A_TITLE = [
  /^[A-Za-z]:\\/,
  /^\//,
  /^https?:\/\//i,
  /\.(pdf|epub|docx?|indd|qxd|tex)$/i,
  /^(microsoft|adobe|acrobat|pdftex|latex|quark|calibre)\b/i,
];

/** A single token of forty characters is a hash or an identifier that
 * ended up in a text field, not a title or a name. */
function isOpaque(value: string): boolean {
  return !value.includes(" ") && value.length > 40;
}

function validateOne(value: string, hint: FieldHint): Verdict {
  const text = value.trim();
  if (text === "") return { ok: false, reason: "empty" };

  switch (hint) {
    case "isbn":
      // Reaching here means normalisation already produced a canonical
      // form, so a failure is a bug rather than bad input — checked
      // anyway, because this is the field where a wrong value is most
      // confidently wrong.
      return isIsbn(text) ? OK : { ok: false, reason: "isbn check digit does not verify" };

    case "published": {
      const year = Number(text.slice(0, 4));
      if (!Number.isInteger(year)) return { ok: false, reason: "not a date" };
      // A publication date in the future is a re-wrapper's clock, and one
      // before the printing press is a parse that went wrong.
      const limit = new Date().getFullYear() + 1;
      if (year < 1400 || year > limit) {
        return { ok: false, reason: `year ${year} is outside a plausible range` };
      }
      return OK;
    }

    case "title":
      if (NOT_A_TITLE.some((pattern) => pattern.test(text))) {
        return { ok: false, reason: "reads as a path, url or producer banner" };
      }
      if (isOpaque(text)) return { ok: false, reason: "reads as an identifier, not a title" };
      if (text.length > 500) return { ok: false, reason: "too long to be a title" };
      return OK;

    case "author":
      if (isOpaque(text)) return { ok: false, reason: "reads as an identifier, not a name" };
      if (text.length > 200) return { ok: false, reason: "too long to be a name" };
      // A tool's name in the Author field is the single most common wrong
      // author there is.
      if (/^(microsoft|adobe|acrobat|calibre|pdftex|latex|word|writer|user|admin(istrator)?)\b/i.test(text)) {
        return { ok: false, reason: "reads as the producing tool, not a person" };
      }
      return OK;

    case "subject": {
      // A filename that wandered into a topic field. The extension is
      // the tell, and it is conclusive: no subject heading ends `.epub`.
      if (/\.(epub|pdf|docx?|txt|mobi|azw3?)$/i.test(text)) {
        return { ok: false, reason: "reads as a filename, not a subject" };
      }
      // A watermark or a catalogue code rather than a topic. `WCN: 02-300`
      // is stamped into every Cengage textbook's metadata, and it grounds
      // perfectly because it genuinely is in the file.
      const dense = text.replace(/\s/g, "");
      const codeish = (dense.match(/[\d\p{P}]/gu) ?? []).length / Math.max(dense.length, 1);
      if (codeish > 0.3) return { ok: false, reason: "reads as a code, not a subject" };
      if (text.length > 200) return { ok: false, reason: "too long to be a subject" };
      return OK;
    }

    case "pages": {
      const count = Number(text);
      if (!Number.isInteger(count) || count <= 0) return { ok: false, reason: "not a page count" };
      return OK;
    }

    case "generic":
    default:
      if (text.length > 20_000) return { ok: false, reason: "implausibly long for a field" };
      return OK;
  }
}

export function validateValue(value: string | string[], hint: FieldHint): Verdict {
  if (Array.isArray(value)) {
    if (value.length === 0) return { ok: false, reason: "empty" };
    // One bad entry does not condemn the list — but every entry being bad
    // means the list is not what it claims to be.
    const verdicts = value.map((entry) => validateOne(entry, hint));
    if (verdicts.every((verdict) => !verdict.ok)) {
      return { ok: false, reason: verdicts[0]?.reason ?? "no valid entries" };
    }
    return OK;
  }
  return validateOne(value, hint);
}
