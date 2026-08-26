// Authored by Karter Whitman using Claude Opus 5
// Where the weights live, and how they get there.
//
// `~/.index/models/`, beside the database store and the derivation
// caches — user data, not repo content. The app installs small and the
// 730 MB arrives on first use.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MODEL_FILE = "LFM2-1.2B-Extract-Q4_K_M.gguf";

/**
 * LiquidAI's extraction-tuned 1.2B, at Q4_K_M.
 *
 * The *Extract* variant rather than the base instruct model: it is
 * trained for exactly this shape — unstructured evidence in, structured
 * JSON out — and defaults to JSON output. Q4_K_M because the job is
 * short-string synthesis rather than long-form generation, and the
 * quality difference against Q8 does not show up here.
 */
const MODEL_URL =
  "https://huggingface.co/LiquidAI/LFM2-1.2B-Extract-GGUF/resolve/main/LFM2-1.2B-Extract-Q4_K_M.gguf";

/** Below this the file is a redirect page, an error body, or a download
 * that died partway — all of which llama.cpp reports as a corrupt model
 * rather than a missing one, which is a much harder thing to diagnose. */
const MIN_PLAUSIBLE_BYTES = 500_000_000;

export function modelsDir(): string {
  return process.env["INDEX_MODELS_DIR"] ?? path.join(os.homedir(), ".index", "models");
}

export function modelPath(): string {
  return path.join(modelsDir(), MODEL_FILE);
}

/** Present and plausible, or not there at all. */
export function modelAvailable(): boolean {
  try {
    return fs.statSync(modelPath()).size >= MIN_PLAUSIBLE_BYTES;
  } catch {
    return false;
  }
}

/**
 * Fetch the weights, if they are not already here.
 *
 * Downloads to a temporary name and renames on completion, so an
 * interrupted fetch never leaves a half file that looks like a model.
 * Never called implicitly by `modelItem` — a 730 MB download is not
 * something a modeling run should start on a caller's behalf.
 */
export async function downloadModel(onProgress?: (fraction: number) => void): Promise<string> {
  const destination = modelPath();
  if (modelAvailable()) return destination;

  fs.mkdirSync(modelsDir(), { recursive: true });
  const partial = `${destination}.partial`;

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`could not fetch the model: HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  const handle = await fs.promises.open(partial, "w");
  let written = 0;

  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await handle.write(value);
      written += value.byteLength;
      if (total > 0) onProgress?.(written / total);
    }
  } finally {
    await handle.close();
  }

  if (written < MIN_PLAUSIBLE_BYTES) {
    fs.rmSync(partial, { force: true });
    throw new Error(`the downloaded model is implausibly small (${written} bytes)`);
  }

  fs.renameSync(partial, destination);
  return destination;
}
