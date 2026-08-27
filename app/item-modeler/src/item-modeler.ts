// Authored by Karter Whitman using Claude Opus 5
// The pipeline:
//
//   extract (collect → basket → transcribe → synthesise)
//     → compose (verify → apply)
//
// Deliberately thin. Every decision it appears to make is made in one of
// the two submodules it calls — what to gather in
// `collector/formats/`, what a file states outright in
// `collector/stated-facts.ts`, what is admissible in
// `composer/validation/`, what may be written in `composer/application/`
// — and what is left here is the *order* plus the Item-in/Item-out
// contract, which is the one thing that belongs in one readable place.
//
// The division the whole module now rests on:
//
//   **Locating knowledge is finite. Interpreting it is not.**
//
// Finding where an epub keeps its metadata is bounded work with a
// specification behind it. Deciding what `Feminism-Pantheon` means is
// not, because the conventions are invented by whoever named the file. An
// earlier design let the second kind of question live in the readers as
// regexes, and measured against a real library it produced ten wrong
// titles in twenty-five books, each fix inviting the next convention. The
// deterministic half now gathers and verifies; the model interprets.
//
// The function stays pure with respect to persistence: an Item goes in,
// an Item comes out, and nothing is saved.
import crypto from "node:crypto";
import type { Item, Schema } from "@index/database/types";
import { composeSchema } from "./composer/index.js";
import type {
  ItemModelingOutcome,
  ModelingFailure,
  ModelingMeta,
} from "./contracts/item-modeling-result.js";
import { MODELER_VERSION } from "./contracts/item-modeling-result.js";
import {
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_SOURCE_TEXT,
  DEFAULT_TIMEOUT_MS,
  type ModelingOptions,
  type ResolvedOptions,
} from "./contracts/modeling-options.js";
import { dedupeWarnings, type ModelingWarning } from "./contracts/warnings.js";
import { nodeGateway, offlineGateway } from "./collector/evidence/source-resolution.js";
import { extractClaims } from "./collector/index.js";
import { PROMPT_VERSION } from "./collector/language-model/extraction-prompts.js";

export function resolveOptions(options: ModelingOptions = {}): ResolvedOptions {
  const allowNetworkAccess = options.allowNetworkAccess ?? true;
  return {
    inferType: options.inferType ?? false,
    // `fallback-only` is the default and the one the corpus argues for:
    // where a file states a fact outright the model is not consulted at
    // all, so most epubs never load it and the run costs nothing extra.
    languageModelMode: options.languageModelMode ?? "fallback-only",
    allowNetworkAccess,
    maxSources: options.maxSources ?? DEFAULT_MAX_SOURCES,
    maxSourceTextLength: options.maxSourceTextLength ?? DEFAULT_MAX_SOURCE_TEXT,
    includeProvenance: options.includeProvenance ?? true,
    overwriteModeledValues: options.overwriteModeledValues ?? true,
    conflictPolicy: options.conflictPolicy ?? "record",
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    debugDiagnostics: options.debugDiagnostics ?? false,
    userFields: options.userFields ?? [],
    gateway: options.gateway ?? (allowNetworkAccess ? nodeGateway : offlineGateway),
    model: options.model ?? null,
    now: options.now ?? (() => new Date()),
  };
}

function emptyMeta(durationMs = 0): ModelingMeta {
  return {
    durationMs,
    sources: { attached: 0, read: 0, skipped: 0 },
    evidenceBytes: 0,
    truncated: false,
    claims: { total: 0, deterministic: 0, languageModel: 0, rejected: 0 },
    modelerVersion: MODELER_VERSION,
    fingerprint: "",
  };
}

function failed(
  reason: ModelingFailure["reason"],
  message: string,
  meta: ModelingMeta,
): ModelingFailure {
  return { status: "failed", reason, message, meta };
}

/**
 * The run identity: what would have to change for the answer to change.
 *
 * Sources, the schema, the options that affect output, the modeler
 * version — and the **prompt version**, because with a model in the loop
 * the question asked is as much an input as the evidence. A caller
 * comparing this against the last run's can tell "the sources changed"
 * from "the modeler changed" and skip work when neither did.
 */
function fingerprintOf(evidence: string, schema: Schema, options: ResolvedOptions): string {
  return crypto
    .createHash("sha256")
    .update(MODELER_VERSION)
    .update(PROMPT_VERSION)
    .update(evidence)
    .update(JSON.stringify(schema.attributes ?? []))
    .update(
      JSON.stringify([
        options.overwriteModeledValues,
        options.conflictPolicy,
        options.languageModelMode,
        options.maxSources,
        options.maxSourceTextLength,
        [...options.userFields].sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Expand an Item from its attached sources.
 *
 * `schema` is required and is not looked up: this module does not talk to
 * a database, and the caller already knows the type its user chose. An
 * item with no type is refused rather than guessed at — classification is
 * a later component, and inventing a type to have something to extract
 * for is the failure mode the whole design is arranged against.
 */
export async function modelItem(
  item: Item,
  schema: Schema,
  options: ModelingOptions = {},
): Promise<ItemModelingOutcome> {
  const settings = resolveOptions(options);
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  if (!item || typeof item !== "object" || !item.data || !Array.isArray(item.resources)) {
    return failed("invalid-input", "not a usable item", emptyMeta(elapsed()));
  }
  if (options.inferType) {
    return failed(
      "invalid-input",
      "inferType is not supported: classification is not part of this module yet",
      emptyMeta(elapsed()),
    );
  }
  if (!item.data.type || !schema || !Array.isArray(schema.attributes) || schema.attributes.length === 0) {
    return failed(
      "no-type",
      "an item must have a type with declared fields before it can be modeled",
      emptyMeta(elapsed()),
    );
  }
  if (item.resources.length === 0) {
    return failed("no-sources", "the item has no sources to read", emptyMeta(elapsed()));
  }

  try {
    return await withTimeout(runPipeline(item, schema, settings, started), settings.timeout, () =>
      failed("timeout", `modeling exceeded ${settings.timeout}ms`, emptyMeta(elapsed())),
    );
  } catch (error) {
    return failed(
      "internal",
      error instanceof Error ? error.message : String(error),
      emptyMeta(elapsed()),
    );
  }
}

async function runPipeline(
  item: Item,
  schema: Schema,
  settings: ResolvedOptions,
  started: number,
): Promise<ItemModelingOutcome> {
  // 1–4: read the sources, gather the basket, transcribe, synthesise.
  const extracted = await extractClaims({
    resources: item.resources,
    schema,
    gateway: settings.gateway,
    allowNetworkAccess: settings.allowNetworkAccess,
    maxSources: settings.maxSources,
    maxSourceTextLength: settings.maxSourceTextLength,
    languageModelMode: settings.languageModelMode,
    ...(settings.model ? { model: settings.model } : {}),
    // Whatever is left of the run's budget, so a slow model cannot
    // overrun a caller's timeout on its own.
    timeoutMs: Math.max(1000, settings.timeout - (Date.now() - started)),
    now: settings.now,
  });

  const fingerprint = fingerprintOf(extracted.evidenceFingerprint, schema, settings);
  const meta = (extra: Partial<ModelingMeta> = {}): ModelingMeta => ({
    durationMs: Date.now() - started,
    sources: extracted.sources,
    evidenceBytes: extracted.evidenceBytes,
    truncated: extracted.truncated,
    claims: { total: 0, deterministic: 0, languageModel: 0, rejected: 0 },
    modelerVersion: MODELER_VERSION,
    fingerprint,
    ...extra,
  });

  if (extracted.sources.read === 0) {
    return failed("no-evidence", "none of the attached sources could be read", meta());
  }

  // 5–6: normalise, validate, ground, and apply under the ownership
  // policy.
  const composed = await composeSchema({
    claims: extracted.claims,
    evidenceText: extracted.evidenceText,
    schema,
    existing: item,
    userFields: settings.userFields,
    overwriteModeledValues: settings.overwriteModeledValues,
    conflictPolicy: settings.conflictPolicy,
    includeProvenance: settings.includeProvenance,
  });

  return {
    status: "modeled",
    item: composed.item,
    changes: composed.changes,
    warnings: dedupeWarnings([...extracted.warnings, ...composed.warnings]),
    conflicts: composed.conflicts,
    meta: meta({
      claims: {
        total: composed.resolvedCount,
        deterministic: composed.resolvedCount - composed.languageModelCount,
        languageModel: composed.languageModelCount,
        rejected: composed.rejected,
      },
    }),
    ...(settings.debugDiagnostics
      ? {
          diagnostics: {
            basket: extracted.basketEntries,
            ...(extracted.modelAnswer ? { modelAnswer: extracted.modelAnswer } : {}),
          },
        }
      : {}),
  };
}

/** The whole-run budget. A partial answer from a timed-out run is not
 * trustworthy enough to return, so the timeout produces a failure rather
 * than a half-filled Item. */
function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
