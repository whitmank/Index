// Authored by Karter Whitman using Claude Opus 5
// Run the modeler over a real library and write down what it did.
//
// Not a test and not scored: there is no answer key here, and the point
// is not pass or fail. It is to see, per file, what the deterministic
// layer actually claimed, which reader claimed it, and how sure that
// reader was — over books nobody chose to make convenient.
//
// Fixtures cannot produce this. A synthetic epub is built to the spec by
// the same understanding that wrote the reader, so it agrees by
// construction; a shelf of real books disagrees in ways nobody thought
// to encode. The report exists to make those disagreements visible in
// one screen rather than one at a time.
//
//   npm run survey -- <directory> [--out <file.html>]
import fs from "node:fs";
import path from "node:path";
import type { Item, Schema } from "@index/database/types";
import { closeModel, modelAvailable, modelItem } from "../src/index.js";
import type { FieldChange, ModelingSuccess } from "../src/contracts/index.js";
import { itemFor } from "./item.js";
import { renderReport, type SourceReport } from "./report-html.js";

/** The type every source is modeled against. A plausible `book`: the
 * title leads, because `attributes[0]` is the item's name. */
const BOOK: Schema = {
  id: "schemas:book",
  name: "book",
  attributes: [
    { attribute: "title", kind: "string", display: true },
    { attribute: "author", kind: "string", display: true },
    { attribute: "published", kind: "date", display: true },
    { attribute: "publisher", kind: "string", display: true },
    { attribute: "isbn", kind: "string", display: true },
    { attribute: "subject", kind: "list", display: true },
  ],
};

const READABLE = /\.(epub|pdf)$/i;

function walk(from: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(from, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (READABLE.test(entry.name)) found.push(full);
  }
  return found.sort((a, b) => a.localeCompare(b));
}

function valueOf(item: Item, name: string): string | string[] | undefined {
  return item.metadata.find(
    (entry) => entry.attribute !== null && entry.attribute.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/**
 * One source, modeled from nothing but itself.
 *
 * The item is minted the way intake mints one — a name taken from the
 * file, no fields — so the run has exactly what it would have in the app
 * and nothing has been fed in that a real item would not carry.
 */
async function survey(filepath: string): Promise<SourceReport> {
  const stat = fs.statSync(filepath);
  const item = itemFor(filepath, { type: BOOK.name });
  const started = Date.now();

  const outcome = await modelItem(item, BOOK, {
    derivedName: item.name,
    debugDiagnostics: true,
  });

  const base = {
    filename: path.basename(filepath),
    directory: path.dirname(filepath),
    sizeBytes: stat.size,
    durationMs: Date.now() - started,
  };

  if (outcome.status === "failed") {
    return {
      ...base,
      status: "failed" as const,
      failure: `${outcome.reason}: ${outcome.message}`,
      mime: null,
      name: null,
      fields: [],
      warnings: [],
      conflicts: [],
      basket: [],
      modelAnswer: null,
    };
  }

  const result = outcome as ModelingSuccess;
  const nameChange = result.changes.find((change) => change.target === "name");
  const wroteName =
    nameChange !== undefined &&
    nameChange.action !== "skipped" &&
    nameChange.action !== "conflicted";

  return {
    ...base,
    status: "modeled" as const,
    mime: null,
    // The name only counts as extracted when this run wrote it. An item
    // always carries *a* name — the file's — and reporting that as a
    // result would make the module look like it read every title on the
    // shelf when it read none of them.
    name: wroteName ? result.item.name : null,
    nameProvenance: nameChange?.provenance ?? null,
    fields: BOOK.attributes.slice(1).map((attribute) => {
      const change = result.changes.find((entry) => entry.field === attribute.attribute);
      return {
        name: attribute.attribute,
        value: valueOf(result.item, attribute.attribute) ?? null,
        action: (change?.action ?? null) as FieldChange["action"] | null,
        provenance: change?.provenance ?? null,
      };
    }),
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      field: warning.field ?? null,
      message: warning.message,
    })),
    conflicts: result.conflicts.map((conflict) => ({
      field: conflict.field,
      incumbent: conflict.incumbent.value,
      challengers: conflict.challengers.map((side) => side.value),
      reason: conflict.reason,
    })),
    // The basket the model read, verbatim. With one synthesising
    // consumer there are no losing candidates to list, so "why does this
    // field say that" is answered by what was in front of it.
    basket: result.diagnostics?.basket ?? [],
    modelAnswer: result.diagnostics?.modelAnswer ?? null,
    meta: {
      sourcesRead: result.meta.sources.read,
      evidenceBytes: result.meta.evidenceBytes,
      truncated: result.meta.truncated,
      claimsTotal: result.meta.claims.total,
      claimsRejected: result.meta.claims.rejected,
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const directory = args.find((arg) => !arg.startsWith("--"));
  if (!directory) {
    process.stderr.write("usage: npm run survey -- <directory> [--out <file.html>]\n");
    process.exitCode = 2;
    return;
  }

  const outIndex = args.indexOf("--out");
  const out =
    outIndex !== -1 && args[outIndex + 1]
      ? (args[outIndex + 1] as string)
      : path.join(process.cwd(), "item-modeler-survey.html");

  const sources = walk(path.resolve(directory));
  if (sources.length === 0) {
    process.stderr.write(`no .epub or .pdf files under ${directory}\n`);
    process.exitCode = 2;
    return;
  }

  process.stdout.write(
    `modeling ${sources.length} sources from ${directory}\n` +
      `extraction model: ${modelAvailable() ? "installed" : "NOT INSTALLED — stated facts only"}\n\n`,
  );
  const reports: SourceReport[] = [];
  for (const source of sources) {
    const report = await survey(source);
    reports.push(report);
    const filled = report.fields.filter((field) => field.value !== null).length;
    const mark = report.status === "failed" ? "!" : filled === 0 && !report.name ? "·" : "✓";
    process.stdout.write(
      `  ${mark} ${String(filled + (report.name ? 1 : 0)).padStart(2)}/6  ` +
        `${String(report.durationMs).padStart(5)}ms  ${report.filename.slice(0, 78)}\n`,
    );
  }

  fs.writeFileSync(
    out,
    renderReport({
      corpus: path.resolve(directory),
      generatedAt: new Date(),
      schema: BOOK,
      sources: reports,
    }),
  );
  process.stdout.write(`\nwrote ${out}\n`);
  // The weights hold real memory and keep the process alive.
  await closeModel();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
