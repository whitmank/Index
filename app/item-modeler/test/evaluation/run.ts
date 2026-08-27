// Authored by Karter Whitman using Claude Opus 5
// `npm run eval` — model the ground-truth corpus and score the answers.
//
// This is the measurement the deterministic pass exists to produce. The
// unit tests establish that the machinery is correct; only a real library
// can say whether it is *right*, and about which fields. The per-field
// table it prints is the input to the next decision — what the local
// extraction model is actually for.
//
// Usage:
//   npm run eval                          scores $INDEX_EVAL_CORPUS
//   npm run eval -- --template <dir>      prints a manifest to fill in
//   npm run eval -- --json                machine-readable, for tracking
import fs from "node:fs";
import path from "node:path";
import type { Item } from "@index/database/types";
import { modelItem } from "../../src/index.js";
import type { ModelingSuccess } from "../../src/contracts/index.js";
import {
  corpusPath,
  loadCorpus,
  sourceOf,
  template,
  CorpusError,
  type Corpus,
  type CorpusEntry,
} from "./corpus.js";
import { diffs, fieldTable, summary, totalsOf } from "./report.js";
import { scoreFields, ungroundedFields, wrongRate, type EntryScore } from "./score.js";
import { itemFor } from "../item.js";

/** The corpus supplies truth, not a starting point: every entry is
 * modeled from an item that carries only its source, so nothing the
 * module produces can have come from the answer key. */
function blankItem(entry: CorpusEntry, source: string, corpus: Corpus): Item {
  return itemFor(source, { type: (entry.item.data.type?.value as string) ?? corpus.schema.name });
}

async function scoreEntry(entry: CorpusEntry, corpus: Corpus, manifest: string): Promise<EntryScore> {
  const source = sourceOf(entry, manifest);
  const started = Date.now();

  const base: EntryScore = {
    source,
    ...(entry.note ? { note: entry.note } : {}),
    fields: [],
    ungrounded: [],
    durationMs: 0,
    warnings: 0,
    conflicts: 0,
    idempotent: true,
  };

  if (!/^[a-z]+:\/\//i.test(source) && !fs.existsSync(source)) {
    return { ...base, durationMs: 0, failure: `no such source: ${source}` };
  }

  const item = blankItem(entry, source, corpus);
  const outcome = await modelItem(item, corpus.schema, { debugDiagnostics: true });

  if (outcome.status === "failed") {
    return { ...base, durationMs: Date.now() - started, failure: `${outcome.reason}: ${outcome.message}` };
  }
  const result = outcome as ModelingSuccess;

  // The spec's idempotency test, run per source rather than asserted
  // once: model the answer again and require that nothing is populated.
  const again = await modelItem(result.item, corpus.schema);
  const idempotent =
    again.status === "modeled" &&
    again.changes.every((change) => change.action !== "populated" && change.action !== "replaced");

  return {
    ...base,
    fields: scoreFields({
      truth: entry.item,
      modeled: result.item,
      schema: corpus.schema,
      changes: result.changes,
    }),
    ungrounded: ungroundedFields(result.changes),
    durationMs: Date.now() - started,
    warnings: result.warnings.length,
    conflicts: result.conflicts.length,
    idempotent,
  };
}

/** `--template <dir>` — every readable book in a directory, listed with
 * blank fields to fill in. Filling in blanks beats writing JSON. */
function printTemplate(from: string | undefined): void {
  const sources = from && fs.existsSync(from)
    ? fs
        .readdirSync(from)
        .filter((name) => /\.(pdf|epub)$/i.test(name))
        .map((name) => path.join(from, name))
        .sort()
    : [];
  process.stdout.write(template(sources));
  if (sources.length === 0 && from) {
    process.stderr.write(`\nno .pdf or .epub files found in ${from}\n`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--template")) {
    printTemplate(args[args.indexOf("--template") + 1]);
    return;
  }

  const manifest = corpusPath();
  const corpus = loadCorpus(manifest);

  const entries: EntryScore[] = [];
  for (const entry of corpus.entries) {
    entries.push(await scoreEntry(entry, corpus, manifest));
  }

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ totals: totalsOf(entries), entries }, null, 2)}\n`);
    return;
  }

  const fields = corpus.schema.attributes.map((attribute) => attribute.attribute);
  console.log(`\n${summary(entries)}\n`);
  console.log(`${fieldTable(entries, fields)}\n`);
  console.log(`${diffs(entries)}\n`);

  // A wrong value is the failure this module is arranged against, so the
  // exit code tracks it rather than the fill rate. A corpus with nothing
  // wrong exits clean however much it missed.
  const totals = totalsOf(entries);
  const failed = entries.filter((entry) => entry.failure).length;
  if (totals.wrong > 0 || failed > 0) process.exitCode = 1;
  console.log(
    totals.wrong === 0 && failed === 0
      ? "nothing populated incorrectly.\n"
      : `${totals.wrong} wrong (${(wrongRate(totals) * 100).toFixed(1)}% of populated), ${failed} failed to model.\n`,
  );
}

main().catch((error) => {
  if (error instanceof CorpusError) {
    process.stderr.write(`\n${error.message}\n\n`);
    process.exitCode = 2;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
