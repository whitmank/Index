// Authored by Karter Whitman using Claude Opus 5
// What a file was named, handed over as-is.
//
// This file used to be 240 lines of regex trying to read a name apart —
// which side of a dash is the author, whether a bracket holds a year,
// whether a capitalised phrase is a person or a press. Measured against a
// real library it produced ten wrong titles out of twenty-five, and every
// fix was another convention: ` -- ` for one archive, `Title-Publisher`
// glued for another, three-author lists for a third. That is an arms race
// with no end, because the conventions are invented by whoever names the
// file.
//
// So the parsing is gone. The name goes into the basket whole, and
// reading it apart is the language model's job — which it does using the
// *rest* of the basket, something no rule here could ever see. The
// publisher that ends `…Everyday Chaos…-Harvard Business Review Press` is
// named outright in that book's OPF, two entries away.
//
// What remains is the part that was never interpretation: identifiers
// that verify. A checksum is arithmetic, and knowing that the digits in a
// name are a real ISBN — rather than a document number or an md5 — is a
// fact worth handing over already settled.
import { add, type BasketEntry } from "../../evidence/basket.js";
import type { SourceEvidence } from "../../evidence/source-evidence.js";
import { findIsbn } from "../../normalization/normalize-identifiers.js";
import type { Collector } from "./collector.js";

/** A doi as a filesystem writes it: `/` is illegal in a name, so archives
 * substitute `_`. Both spellings appear in the wild. */
const DOI = /\b(10\.\d{4,9})[/_]([^\s\][()]+)/;

function basenameOf(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? uri;
  const parts = withoutQuery.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export const filenameCollector: Collector = {
  name: "filename",

  // Every source has a name, including one whose bytes could not be read
  // at all — which is the case this collector matters most for.
  handles(): boolean {
    return true;
  },

  async collect(source: SourceEvidence, basket: BasketEntry[]): Promise<void> {
    const name = basenameOf(source.name || source.uri);
    if (name === "") return;

    add(basket, "filename", name, source.sourceId);

    // The media type is deliberately *not* collected. It said
    // `application/pdf`, which is true, useless, and came back out of the
    // model as a book's subject — while the format is already legible
    // from the other keys, which are prefixed `pdf.` or `opf.`. A fact
    // that adds nothing and can be misread is worse than no fact.

    const isbn = findIsbn(name);
    if (isbn) add(basket, "verified_isbn13", isbn, source.sourceId);

    const doi = DOI.exec(name);
    if (doi?.[1] && doi[2]) add(basket, "verified_doi", `${doi[1]}/${doi[2]}`, source.sourceId);
  },
};
