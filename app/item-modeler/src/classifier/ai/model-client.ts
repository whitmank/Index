// Authored by Karter Whitman using Claude Sonnet 5
// The item classifier's own model, run in this process — a separate,
// smaller runtime concern from `extraction/language-model/local-model-
// client.ts`, not a variant of it.
//
// Two things force the split rather than sharing that file's loader:
//
// - **The weights are not this app's to manage.** Extraction's model
//   lives at a fixed path this app downloads itself. The item classifier
//   is pointed at whatever `.gguf` a person has on disk (Settings →
//   Models), so "the model" is a path chosen at runtime, not a constant.
// - **The cache has to be keyed by that path.** Pointing Settings at a
//   different file must not keep serving the old one, the way a single
//   cached instance would.
//
// The request/response shape is still `ModelClient` — imported, not
// redefined — so this plugs into the same grammar-enforcement guarantee
// and the same test-stub pattern extraction already established.
import fs from "node:fs";
import type { Llama, LlamaContext, LlamaModel } from "node-llama-cpp";
import type { ExtractionRequest, ModelClient } from "../../collector/language-model/local-model-client.js";

/** Small on purpose: the whole prompt is a short list of type names plus
 * one line of user text, and the answer is one enum token. Extraction's
 * 8192/512 budget is sized for a basket and a multi-field object; neither
 * applies here. */
const CONTEXT_SIZE = 2048;
const SEQUENCES = 4;
const MAX_TOKENS = 32;

type LlamaModule = typeof import("node-llama-cpp");

interface LoadedModel {
  llama: Llama;
  model: LlamaModel;
  context: LlamaContext;
  module: LlamaModule;
}

const cached = new Map<string, Promise<LoadedModel>>();

async function load(modelPath: string): Promise<LoadedModel> {
  const module: LlamaModule = await import("node-llama-cpp");
  const llama = await module.getLlama();
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext({ contextSize: CONTEXT_SIZE, sequences: SEQUENCES });
  return { llama, model, context, module };
}

/**
 * A client for the `.gguf` at `modelPath`, or null when there is nothing
 * usable there.
 *
 * Null rather than throwing: a path that doesn't exist, or a file that
 * fails to load as a model, is a *configuration* state — the file was
 * moved, deleted, or was never a real model — and the caller (`classify.ts`)
 * degrades to "no opinion" for exactly the same reason a missing
 * extraction model does.
 */
export async function openItemClassifierModel(modelPath: string): Promise<ModelClient | null> {
  if (!fs.existsSync(modelPath)) return null;

  let entry = cached.get(modelPath);
  if (!entry) {
    entry = load(modelPath).catch((error) => {
      cached.delete(modelPath);
      throw error;
    });
    cached.set(modelPath, entry);
  }

  let loaded: LoadedModel;
  try {
    loaded = await entry;
  } catch {
    return null;
  }

  const grammars = new Map<string, Awaited<ReturnType<Llama["createGrammarForJsonSchema"]>>>();

  return {
    async extract(request: ExtractionRequest): Promise<Record<string, unknown>> {
      const key = JSON.stringify(request.schema);
      let grammar = grammars.get(key);
      if (!grammar) {
        grammar = await loaded.llama.createGrammarForJsonSchema(request.schema as never);
        grammars.set(key, grammar);
      }

      const sequence = loaded.context.getSequence();
      const session = new loaded.module.LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: request.system,
      });

      try {
        const answer = await session.prompt(request.user, {
          grammar,
          temperature: 0,
          maxTokens: MAX_TOKENS,
          signal: AbortSignal.timeout(request.timeoutMs),
        });
        return grammar.parse(answer) as unknown as Record<string, unknown>;
      } finally {
        session.dispose();
        await sequence.dispose();
      }
    },

    describe: () => ({ name: modelPath.split("/").pop() ?? modelPath, quantization: "" }),

    async dispose(): Promise<void> {
      // Deliberately a no-op, same reasoning as extraction's client:
      // several classify calls in a row share the load.
    },
  };
}

/** Release one model's weights, or every one cached when no path is
 * given. For tests and for a process that is done classifying. */
export async function closeItemClassifierModel(modelPath?: string): Promise<void> {
  const paths = modelPath ? [modelPath] : [...cached.keys()];
  for (const path of paths) {
    const loaded = await cached.get(path)?.catch(() => null);
    cached.delete(path);
    if (!loaded) continue;
    await loaded.context.dispose();
    await loaded.model.dispose();
    await loaded.llama.dispose();
  }
}
