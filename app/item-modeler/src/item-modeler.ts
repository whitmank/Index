// Authored by Karter Whitman using Claude Opus 5
// The pipeline:
//
//   collect → basket → transcribe what is stated → synthesise the rest
//           → verify → apply
//
// Deliberately thin. Every decision it appears to make is made somewhere
// else — what to gather in `extraction/collectors/`, what a file states
// outright in `stated-facts.ts`, what is admissible in `validation/`,
// what may be written in `application/` — and what is left here is the
// *order*, which is the one thing that belongs in one readable place.
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
import { applyModelingResult } from "./application/apply-modeling-result.js";
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
import { groundingText, render } from "./evidence/basket.js";
import {
  collectItemEvidence,
  evidenceFingerprint,
} from "./evidence/collect-item-evidence.js";
import { nodeGateway, offlineGateway } from "./evidence/source-resolution.js";
import { collectBasket } from "./extraction/collect-basket.js";
import { statedFacts } from "./extraction/stated-facts.js";
import { extractWithModel } from "./extraction/language-model/extract-with-model.js";
import { openModel, type ModelClient } from "./extraction/language-model/local-model-client.js";
import { modelAvailable } from "./extraction/language-model/model-store.js";
import { resolveValues, type Candidate } from "./validation/resolve-values.js";
import { PROMPT_VERSION } from "./extraction/language-model/extraction-prompts.js";

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
    derivedName: options.derivedName ?? null,
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
    .update(JSON.stringify(schema.fields ?? []))
    .update(
      JSON.stringify([
        options.overwriteModeledValues,
        options.conflictPolicy,
        options.languageModelMode,
        options.maxSources,
        options.maxSourceTextLength,
        [...options.userFields].sort(),
        options.derivedName,
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

  if (!item || typeof item !== "object" || !Array.isArray(item.resources)) {
    return failed("invalid-input", "not a usable item", emptyMeta(elapsed()));
  }
  if (options.inferType) {
    return failed(
      "invalid-input",
      "inferType is not supported: classification is not part of this module yet",
      emptyMeta(elapsed()),
    );
  }
  if (!item.type || !schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
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
  // 1 — read the sources, bounded.
  const evidence = await collectItemEvidence(item, {
    gateway: settings.gateway,
    maxSources: settings.maxSources,
    maxSourceTextLength: settings.maxSourceTextLength,
    allowNetworkAccess: settings.allowNetworkAccess,
  });

  const fingerprint = fingerprintOf(evidenceFingerprint(evidence.sources), schema, settings);
  const meta = (extra: Partial<ModelingMeta> = {}): ModelingMeta => ({
    durationMs: Date.now() - started,
    sources: {
      attached: evidence.attached,
      read: evidence.sources.length,
      skipped: evidence.skipped,
    },
    evidenceBytes: evidence.bytes,
    truncated: evidence.truncated,
    claims: { total: 0, deterministic: 0, languageModel: 0, rejected: 0 },
    modelerVersion: MODELER_VERSION,
    fingerprint,
    ...extra,
  });

  if (evidence.sources.length === 0) {
    return failed("no-evidence", "none of the attached sources could be read", meta());
  }

  // 2 — gather everything into one basket. Collectors do not interpret.
  const collected = await collectBasket(evidence.sources);
  const warnings: ModelingWarning[] = [...evidence.warnings, ...collected.warnings];

  // 3 — transcribe what a file states outright. No ranking, no
  // arbitration: a short list of places where a format *declares* a
  // field, copied.
  const stated = statedFacts(collected.basket, schema, settings.now);
  const candidates: Candidate[] = stated.map((fact) => ({
    field: fact.field,
    value: fact.value,
    provenance: fact.provenance,
  }));

  // 4 — synthesise the rest, reading the whole basket at once. This is
  // where a filename gets read apart using facts that live in *other*
  // entries: the publisher ending `…-Harvard Business Review Press` is
  // named outright in that book's own package document.
  let modelAnswer: Record<string, unknown> | undefined;
  const settledFields = stated.map((fact) => fact.field);
  const wantsModel =
    settings.languageModelMode !== "never" && settledFields.length < schema.fields.length;

  if (wantsModel) {
    const client = settings.model ?? (await openModelSafely(warnings));
    if (client) {
      const extraction = await extractWithModel({
        client,
        basket: collected.basket,
        schema,
        already: settledFields,
        // Whatever is left of the run's budget, so a slow model cannot
        // overrun a caller's timeout on its own.
        timeoutMs: Math.max(1000, settings.timeout - (Date.now() - started)),
        now: settings.now,
      });
      warnings.push(...extraction.warnings);
      modelAnswer = Object.fromEntries(
        extraction.values.map((value) => [value.field, value.value]),
      );
      candidates.push(
        ...extraction.values.map((value) => ({
          field: value.field,
          value: value.value,
          provenance: value.provenance,
        })),
      );
    }
  }

  // 5 — normalise, validate, and ground. The one gate a transcribed fact
  // skips is grounding: it came from the evidence by construction, while
  // a synthesised value has to prove it did.
  const resolution = resolveValues({
    candidates,
    schema,
    evidence: groundingText(collected.basket),
  });
  warnings.push(...resolution.warnings);

  // A field nothing spoke to is not an error — evidence was absent, which
  // the spec says to prefer over invention.
  for (const field of schema.fields) {
    if (resolution.values.some((value) => value.field === field.name)) continue;
    warnings.push({
      code: "field-unsupported",
      field: field.name,
      message: `nothing in the evidence established '${field.name}'`,
    });
  }

  // 6 — apply, under the ownership policy.
  const applied = applyModelingResult({
    item,
    schema,
    resolved: resolution.values,
    userFields: settings.userFields,
    derivedName: settings.derivedName,
    overwriteModeledValues: settings.overwriteModeledValues,
    conflictPolicy: settings.conflictPolicy,
  });

  const fromModel = resolution.values.filter(
    (value) => value.provenance.origin === "language-model",
  ).length;

  return {
    status: "modeled",
    item: applied.item,
    changes: settings.includeProvenance
      ? applied.changes
      : applied.changes.map(({ provenance: _provenance, ...rest }) => rest),
    warnings: dedupeWarnings(warnings),
    conflicts: applied.conflicts,
    meta: meta({
      claims: {
        total: resolution.values.length,
        deterministic: resolution.values.length - fromModel,
        languageModel: fromModel,
        rejected: resolution.rejected,
      },
    }),
    ...(settings.debugDiagnostics
      ? {
          diagnostics: {
            basket: collected.basket.entries.map((entry) => ({
              key: entry.key,
              value: entry.value,
            })),
            ...(modelAnswer ? { modelAnswer } : {}),
          },
        }
      : {}),
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
