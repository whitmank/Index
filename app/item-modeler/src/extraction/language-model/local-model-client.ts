// Authored by Karter Whitman using Claude Opus 5
// The model, run in this process.
//
// `node-llama-cpp` with a GGUF on disk: no server to install, no second
// process to supervise, and — the reason it was chosen over an HTTP
// runtime — **token-level grammar enforcement**. The output cannot be
// malformed JSON or carry a field outside the schema, because the
// sampler will not emit those tokens. That is a stronger guarantee than
// parsing-and-retrying, and it removes a whole class of failure before
// it starts.
//
// Loading is lazy and cached: the weights are ~730 MB and a modeling run
// that touches no model should not pay for one. Everything is disposable,
// because llama contexts hold real memory and a long-lived process
// modeling a library would otherwise accumulate them.
import type { Llama, LlamaContext, LlamaModel } from "node-llama-cpp";
import { modelAvailable, modelPath } from "./model-store.js";

/** Enough for the schema, the basket and the answer. A basket is capped
 * at 120 entries, so this is generous rather than tight — and a bigger
 * context costs memory whether or not it is used. */
const CONTEXT_SIZE = 8192;

/** Concurrent sequences. The pipeline models one item at a time; a couple
 * of spares keep a caller that overlaps runs from failing on "no
 * sequences left". */
const SEQUENCES = 4;

export interface ExtractionRequest {
  system: string;
  user: string;
  /** A JSON schema. The grammar is built from it and cached, since
   * building one is not free and every item of a type shares it. */
  schema: object;
  timeoutMs: number;
}

export interface ModelClient {
  extract(request: ExtractionRequest): Promise<Record<string, unknown>>;
  describe(): { name: string; quantization: string };
  dispose(): Promise<void>;
}

/** Kept out of the module's import graph until something actually models
 * with it — importing `node-llama-cpp` loads a native binding. */
type LlamaModule = typeof import("node-llama-cpp");

let cached: Promise<LoadedModel> | null = null;

interface LoadedModel {
  llama: Llama;
  model: LlamaModel;
  context: LlamaContext;
  module: LlamaModule;
}

async function load(): Promise<LoadedModel> {
  const module: LlamaModule = await import("node-llama-cpp");
  const llama = await module.getLlama();
  const model = await llama.loadModel({ modelPath: modelPath() });
  const context = await model.createContext({ contextSize: CONTEXT_SIZE, sequences: SEQUENCES });
  return { llama, model, context, module };
}

/**
 * A client, or null when there are no weights on disk.
 *
 * Null rather than throwing, because a missing model is a *configuration*
 * state and not an error — the caller decides whether to degrade to
 * deterministic-only or to refuse.
 */
export async function openModel(): Promise<ModelClient | null> {
  if (!modelAvailable()) return null;

  cached ??= load().catch((error) => {
    cached = null;
    throw error;
  });
  const loaded = await cached;

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
          // Greedy, as Liquid specifies for this checkpoint. Extraction
          // is not a task with a creative axis, and determinism is worth
          // more here than variety: the same book must model the same way
          // twice or the idempotency guarantee is a fiction.
          temperature: 0,
          maxTokens: 512,
          signal: AbortSignal.timeout(request.timeoutMs),
        });
        // The grammar guarantees a well-formed object of the declared
        // shape, so this cast is the type system catching up with a
        // constraint enforced at the sampler rather than a leap of faith.
        return grammar.parse(answer) as unknown as Record<string, unknown>;
      } finally {
        session.dispose();
        await sequence.dispose();
      }
    },

    describe: () => ({ name: "LFM2-1.2B-Extract", quantization: "Q4_K_M" }),

    async dispose(): Promise<void> {
      // Deliberately does not tear down the cached model: several items
      // in one run share it, and reloading 730 MB per item would cost
      // more than the extraction.
    },
  };
}

/** Release the weights. For a process that is finished modeling — the
 * survey and the test suite both call it so they can exit. */
export async function closeModel(): Promise<void> {
  const loaded = await cached?.catch(() => null);
  cached = null;
  if (!loaded) return;
  await loaded.context.dispose();
  await loaded.model.dispose();
  await loaded.llama.dispose();
}
