// Authored by Karter Whitman using Claude Sonnet 5
// The item classifier's one verb: a short description in, one of the
// user's own type names out — or null, honestly, when nothing fits, the
// model has no opinion, or there is no model to ask at all.
//
// Fully standalone from `item-modeler.ts`'s `modelItem()` pipeline: no
// evidence, no basket, no validation/grounding step. Grounding exists
// there because a value has to prove it came from the evidence; here
// there is no evidence beyond the description itself; the enum grammar is
// the entire admissibility check.
import type { ModelClient } from "../../extractor/language-model/local-model-client.js";
import type { ModelingWarning } from "../../contracts/warnings.js";
import { openItemClassifierModel } from "./model-client.js";
import { itemClassifierSystemPrompt, itemClassifierUserPrompt } from "./prompts.js";
import { schemaForTypes, type ItemType, type ItemTypeSchema } from "./schema.js";

export type { ItemType };

export interface ClassifyItemTypeRequest {
  description: string;
  types: ItemType[];
  /** Absolute path to a `.gguf` file — required unless `client` is
   * given. Chosen by the caller (Settings → Models), not this module:
   * item-classifier does not know where models live on disk. */
  modelPath?: string;
  /** Injectable for tests, same port `modelItem`'s tests use. */
  client?: ModelClient;
  timeoutMs?: number;
}

export interface ClassifyItemTypeResult {
  type: string | null;
  warnings: ModelingWarning[];
  latencyMs: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

export async function classifyItemType(request: ClassifyItemTypeRequest): Promise<ClassifyItemTypeResult> {
  const started = Date.now();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (request.types.length === 0 || request.description.trim() === "") {
    return { type: null, warnings: [], latencyMs: Date.now() - started };
  }

  const schema = schemaForTypes(request.types.map((type) => type.name));
  if (!schema) return { type: null, warnings: [], latencyMs: Date.now() - started };

  // A whole-operation deadline, separate from `client.extract()`'s own
  // internal `AbortSignal.timeout`: a cold model load (first use in the
  // process) can itself take a couple of seconds, and a caller on the
  // capture path must never hang past `timeoutMs` regardless of which
  // stage — load or prompt — is slow.
  const outcome = await Promise.race([
    attempt(request, schema, timeoutMs),
    new Promise<{ type: null; warnings: ModelingWarning[] }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            type: null,
            warnings: [
              { code: "reader-failed", message: `the item classifier did not answer within ${timeoutMs}ms` },
            ],
          }),
        timeoutMs,
      ),
    ),
  ]);

  return { ...outcome, latencyMs: Date.now() - started };
}

async function attempt(
  request: ClassifyItemTypeRequest,
  schema: ItemTypeSchema,
  timeoutMs: number,
): Promise<{ type: string | null; warnings: ModelingWarning[] }> {
  const warnings: ModelingWarning[] = [];
  const client = request.client ?? (await openClientSafely(request.modelPath, warnings));
  if (!client) return { type: null, warnings };

  try {
    const answer = await client.extract({
      system: itemClassifierSystemPrompt(request.types),
      user: itemClassifierUserPrompt(request.description),
      schema,
      timeoutMs,
    });

    const raw = answer["type"];
    if (raw === null || raw === undefined) return { type: null, warnings };

    // Never trust the raw string just because a grammar was attached —
    // a test stub (or a future non-grammar path) can say anything. Only
    // an offered name is a real answer.
    const offered = new Set(request.types.map((type) => type.name));
    if (typeof raw === "string" && offered.has(raw)) return { type: raw, warnings };

    warnings.push({
      code: "value-rejected",
      message: `the item classifier answered '${String(raw)}', which is not one of the offered types`,
    });
    return { type: null, warnings };
  } catch (error) {
    warnings.push({
      code: "reader-failed",
      message: `the item classifier did not answer: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { type: null, warnings };
  }
}

/** A missing or unloadable model degrades the run rather than failing
 * it — same posture as `item-modeler.ts`'s own `openModelSafely` for the
 * extraction model, duplicated locally since that function isn't
 * exported and shouldn't be (it's private to a different pipeline). */
async function openClientSafely(
  modelPath: string | undefined,
  warnings: ModelingWarning[],
): Promise<ModelClient | null> {
  if (!modelPath) {
    warnings.push({
      code: "reader-failed",
      message: "no item classifier model is selected; nothing to ask",
    });
    return null;
  }
  const client = await openItemClassifierModel(modelPath);
  if (!client) {
    warnings.push({
      code: "reader-failed",
      message: `the item classifier model at '${modelPath}' could not be loaded`,
    });
  }
  return client;
}
