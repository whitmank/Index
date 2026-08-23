// Authored by Karter Whitman using Claude Opus 5
// Sources → one basket. Every collector that can speak about a source
// does, and nothing decides anything.
//
// Collectors are keyed by **what the bytes are**, not by the item's type.
// A book arrives as an epub or a pdf and neither collector can read the
// other's bytes, while one pdf collector serves a book, a paper and a
// receipt alike. So an item typed `monograph` or `zine` by its user is
// collected exactly as well as one typed `book`.
import type { BasketEntry, EvidenceBasket } from "./evidence/basket.js";
import { BASKET_MAX_ENTRIES } from "./evidence/basket.js";
import type { SourceEvidence } from "./evidence/source-evidence.js";
import type { ModelingWarning } from "../contracts/warnings.js";
import type { Collector } from "./collectors/collector.js";
import { epubCollector } from "./collectors/epub.js";
import { filenameCollector } from "./collectors/filename.js";
import { pdfCollector } from "./collectors/pdf.js";

const COLLECTORS: Collector[] = [filenameCollector, epubCollector, pdfCollector];

export interface Collected {
  basket: EvidenceBasket;
  warnings: ModelingWarning[];
}

export async function collectBasket(sources: SourceEvidence[]): Promise<Collected> {
  const entries: BasketEntry[] = [];
  const warnings: ModelingWarning[] = [];

  // Sources in order — `resources[0]` is primary, so when the cap bites
  // it drops the tail of a long attachment list rather than the file the
  // user said the item *is*.
  for (const source of sources) {
    for (const collector of COLLECTORS) {
      if (!collector.handles(source)) continue;
      try {
        await collector.collect(source, entries);
      } catch (error) {
        // A collector that throws loses only its own findings. A
        // malformed zip is a fact about one file, not a reason to abandon
        // an item that has three other sources.
        warnings.push({
          code: "reader-failed",
          sourceId: source.sourceId,
          message: `${collector.name} could not read '${source.name}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
  }

  const truncated =
    sources.some((source) => source.truncated) || entries.length >= BASKET_MAX_ENTRIES;

  return { basket: { entries, truncated }, warnings };
}
