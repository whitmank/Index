// Authored by Karter Whitman using Claude Sonnet 5
// The staged pipeline SPEC.md asks for: trad first, ai only when trad has
// no opinion — and each stage independently switchable, since a trad rule
// firing wrong and a model call costing time/battery are different things
// to want control over.
import type { Resource } from "@index/database/types";
import type { ModelClient } from "../collector/language-model/local-model-client.js";
import type { ModelingWarning } from "../contracts/warnings.js";
import { classifyItemType, type ItemType } from "./ai/classify.js";
import { classifyTrad, type ClassificationSource } from "./trad/trad-classifier.js";

export interface ClassificationStages {
  trad: boolean;
  ai: boolean;
}

export interface ClassifyResourceRequest {
  resource: Resource;
  source: ClassificationSource | null;
  /** The user's own type names — the ai stage's closed answer space, same
   * as the type-schema shortcut sends. */
  types: ItemType[];
  modelPath?: string;
  stages: ClassificationStages;
  timeoutMs?: number;
  /** Injectable for tests, same port `classifyItemType`'s own tests use —
   * this module never opens a model itself. */
  client?: ModelClient;
}

export interface ClassifyResourceResult {
  type: string | null;
  /** Which stage produced the answer, or null when neither did — the
   * caller's cue for provenance/diagnostics (SPEC.md §8: "was an LLM
   * involved?"). */
  stage: "trad" | "ai" | null;
  warnings: ModelingWarning[];
}

const SNIPPET_LENGTH = 300;

/** What the ai stage is asked to classify, for a resource rather than the
 * shortcut box's free text: the name it's called, plus — for a web page
 * trad already had to read to check for schema.org markup — a short,
 * tag-stripped snippet of what it says. A file with no readable text (an
 * unrecognized binary; a pdf always resolves via trad and never reaches
 * here) falls back to name-only, the same input a bare filename gives the
 * shortcut box today. */
async function descriptionFor(resource: Resource, source: ClassificationSource | null): Promise<string> {
  if (source?.kind !== "web") return resource.name;

  const text = (await source.text())
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SNIPPET_LENGTH);
  return text ? `${resource.name} — ${text}` : resource.name;
}

export async function classifyResource(request: ClassifyResourceRequest): Promise<ClassifyResourceResult> {
  const { resource, source, types, modelPath, stages, timeoutMs, client } = request;

  if (stages.trad) {
    const type = await classifyTrad(resource, source);
    if (type) return { type, stage: "trad", warnings: [] };
  }

  if (stages.ai) {
    const result = await classifyItemType({
      description: await descriptionFor(resource, source),
      types,
      modelPath,
      timeoutMs,
      client,
    });
    return { type: result.type, stage: result.type ? "ai" : null, warnings: result.warnings };
  }

  return { type: null, stage: null, warnings: [] };
}
