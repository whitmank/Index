// Authored by Karter Whitman using Claude Opus 5
// What a collector is: something that finds, and does not decide.
//
// The line this module draws, and the reason it was redrawn:
//
//   Locating knowledge is finite. Interpreting it is not.
//
// "Where does an EPUB keep its metadata" has an answer — the OCF spec
// says so. "Where does a PDF keep its" has two, both documented. That is
// bounded work, per format, and it is what these files do.
//
// "What does `Feminism-Pantheon` mean" has no bounded answer, because it
// depends on conventions invented by whoever named the file. An earlier
// version of this module let that second kind of question leak into the
// readers, as regexes guessing at title/author boundaries — and every new
// library brought a convention the rules had not met. That work moved to
// the language model, which is what synthesis over a whole basket is for.
//
// So a collector reports what it found under the source's own name for
// it, and never asks what it means.
import type { BasketEntry } from "../evidence/basket.js";
import type { SourceEvidence } from "../evidence/source-evidence.js";

export interface Collector {
  readonly name: string;
  handles(source: SourceEvidence): boolean;
  /** Everything found, keyed in the source's vocabulary. Appends into the
   * shared basket rather than returning, so the entry cap is enforced in
   * one place. */
  collect(source: SourceEvidence, basket: BasketEntry[]): Promise<void>;
}
