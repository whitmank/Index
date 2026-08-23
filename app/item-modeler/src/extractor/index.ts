// Authored by Karter Whitman using Claude Sonnet 5
// The extractor: sources in, candidate field claims out.
//
// Collect evidence, gather it into one basket without interpreting it
// (collectors: find, never decide), transcribe what a format plainly
// declares, and synthesise whatever is left with a local model when one
// is available and the schema still has unsettled fields. Nothing here
// decides what gets *written* onto an Item — that is composer's job
// (../composer/index.js). A field a source never spoke to simply
// produces no claim; composer is where "nothing spoke to it" becomes a
// `field-unsupported` warning instead of silence.
//
// Takes a bare resource list rather than an Item, on purpose: intake
// classifies and extracts a resource before it is ever attached to one.
import type { Resource, Schema } from "@index/database/types";
import type { FieldClaim } from "../contracts/field-claim.js";
import type { LanguageModelMode } from "../contracts/modeling-options.js";
import type { ModelingWarning } from "../contracts/warnings.js";
import { groundingText } from "./evidence/basket.js";
import { collectItemEvidence, evidenceFingerprint } from "./evidence/collect-item-evidence.js";
import type { SourceGateway } from "./evidence/source-resolution.js";
import { collectBasket } from "./collect-basket.js";
import { statedFacts } from "./stated-facts.js";
import { extractWithModel } from "./language-model/extract-with-model.js";
import { openModel, type ModelClient } from "./language-model/local-model-client.js";
import { modelAvailable } from "./language-model/model-store.js";

export interface ExtractRequest {
  resources: Resource[];
  schema: Schema;
  gateway: SourceGateway;
  allowNetworkAccess: boolean;
  maxSources: number;
  maxSourceTextLength: number;
  languageModelMode: LanguageModelMode;
  /** Injectable for tests, same port `classifyItemType` uses. When absent
   * and a model turns out to actually be needed, the real local model is
   * opened lazily — never eagerly, since most epubs settle every field
   * deterministically and never touch it. */
  model?: ModelClient;
  timeoutMs: number;
  now: () => Date;
}

export interface ExtractResult {
  claims: FieldClaim[];
  /** What a synthesised claim has to be found in to count as grounded —
   * composer's job, but only the extractor can build it (it is the
   * basket's own text). */
  evidenceText: string;
  /** For the run fingerprint: order-independent, so re-ordering resources
   * without changing them does not read as new content. */
  evidenceFingerprint: string;
  warnings: ModelingWarning[];
  sources: { attached: number; read: number; skipped: number };
  evidenceBytes: number;
  truncated: boolean;
  deterministicCount: number;
  languageModelCount: number;
  /** What the model was shown, for a caller building `debugDiagnostics`.
   * Always populated; whether to expose it is the caller's call. */
  basketEntries: { key: string; value: string }[];
  modelAnswer?: Record<string, unknown>;
}

/**
 * Read the sources, gather them into a basket, transcribe what is stated
 * outright, and synthesise the rest when a model is available and there
 * is anything left to ask it. Never fails — a resource nothing could be
 * read from simply produces no claims, and it is the caller's call
 * whether that is a hard stop (`modelItem`'s `no-evidence`) or an
 * ordinary "nothing found" (intake, adding a resource with no metadata).
 */
export async function extractClaims(request: ExtractRequest): Promise<ExtractResult> {
  const evidence = await collectItemEvidence(request.resources, {
    gateway: request.gateway,
    maxSources: request.maxSources,
    maxSourceTextLength: request.maxSourceTextLength,
    allowNetworkAccess: request.allowNetworkAccess,
  });

  const warnings: ModelingWarning[] = [...evidence.warnings];

  const empty = (): ExtractResult => ({
    claims: [],
    evidenceText: "",
    evidenceFingerprint: evidenceFingerprint(evidence.sources),
    warnings,
    sources: { attached: evidence.attached, read: evidence.sources.length, skipped: evidence.skipped },
    evidenceBytes: evidence.bytes,
    truncated: evidence.truncated,
    deterministicCount: 0,
    languageModelCount: 0,
    basketEntries: [],
  });

  // Nothing to gather a basket from, transcribe, or ask a model about —
  // and, notably, no reason to pay for opening one. The caller decides
  // what an empty read means (`modelItem`'s `no-evidence` failure; an
  // ordinary "found nothing" for a caller extracting a bare resource).
  if (evidence.sources.length === 0) return empty();

  // Collectors do not interpret; they only report what is there.
  const collected = await collectBasket(evidence.sources);
  warnings.push(...collected.warnings);

  // Transcribe what a file states outright. No ranking, no arbitration —
  // a short list of places a format *declares* a field, copied.
  const stated = statedFacts(collected.basket, request.schema, request.now);
  const claims: FieldClaim[] = stated.map((fact) => ({
    field: fact.field,
    value: fact.value,
    provenance: fact.provenance,
  }));

  // Synthesise the rest, reading the whole basket at once — this is where
  // a filename gets read apart using facts that live in a *different*
  // entry (a publisher named outright in the book's own package document).
  let modelAnswer: Record<string, unknown> | undefined;
  const settledFields = stated.map((fact) => fact.field);
  const wantsModel =
    request.languageModelMode !== "never" && settledFields.length < request.schema.attributes.length;

  if (wantsModel) {
    const client = request.model ?? (await openModelSafely(warnings));
    if (client) {
      const extraction = await extractWithModel({
        client,
        basket: collected.basket,
        schema: request.schema,
        already: settledFields,
        timeoutMs: request.timeoutMs,
        now: request.now,
      });
      warnings.push(...extraction.warnings);
      modelAnswer = Object.fromEntries(extraction.values.map((value) => [value.field, value.value]));
      claims.push(
        ...extraction.values.map((value) => ({
          field: value.field,
          value: value.value,
          provenance: value.provenance,
        })),
      );
    }
  }

  return {
    claims,
    evidenceText: groundingText(collected.basket),
    evidenceFingerprint: evidenceFingerprint(evidence.sources),
    warnings,
    sources: { attached: evidence.attached, read: evidence.sources.length, skipped: evidence.skipped },
    evidenceBytes: evidence.bytes,
    truncated: evidence.truncated,
    deterministicCount: stated.length,
    languageModelCount: claims.length - stated.length,
    basketEntries: collected.basket.entries.map((entry) => ({ key: entry.key, value: entry.value })),
    ...(modelAnswer ? { modelAnswer } : {}),
  };
}

/**
 * The model, or nothing — with the reason recorded either way.
 *
 * A missing model is a *degraded* run rather than a failed one: whatever
 * the file stated outright still stands, which for a well-formed epub is
 * most of the answer. What must never happen is silence, because "this
 * book has no publisher" and "nobody was able to look" are different
 * facts and only one of them is about the book.
 */
async function openModelSafely(warnings: ModelingWarning[]): Promise<ModelClient | null> {
  if (!modelAvailable()) {
    warnings.push({
      code: "reader-failed",
      message:
        "the local extraction model is not installed; only facts the file states outright were read",
    });
    return null;
  }
  try {
    return await openModel();
  } catch (error) {
    warnings.push({
      code: "reader-failed",
      message: `the local extraction model could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return null;
  }
}
