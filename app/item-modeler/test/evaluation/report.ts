// Authored by Karter Whitman using Claude Opus 5
// Turning scores into something a person can act on.
//
// Two views, and both are needed. The **per-field table** answers "how is
// the deterministic layer doing, and on what?" — the question that
// decides where effort goes next and what a later extraction model is
// actually for. The **per-file diff** answers "why is this one wrong?",
// which no rate can.
//
// The diff is the half that catches what fixtures cannot. An embedded
// logo's XMP packet written ahead of the document's, or `rdf:Description`
// sitting one local name away from `dc:description`, both pass every
// synthetic test and show up here as a column of confidently wrong
// titles.
import type { EntryScore, FieldScore, Totals } from "./score.js";
import { accuracy, addTotals, tally, wrongRate } from "./score.js";

const GREEN = "[32m";
const RED = "[31m";
const YELLOW = "[33m";
const DIM = "[2m";
const BOLD = "[1m";
const RESET = "[0m";

const MARK: Record<FieldScore["verdict"], string> = {
  correct: `${GREEN}✓${RESET}`,
  missed: `${YELLOW}·${RESET}`,
  wrong: `${RED}✗${RESET}`,
  absent: `${DIM}–${RESET}`,
};

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function show(value: unknown): string {
  if (value === undefined) return "—";
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  return text.length > 64 ? `${text.slice(0, 63)}…` : text;
}

function basename(source: string): string {
  const parts = source.split("/");
  return parts[parts.length - 1] ?? source;
}

/** Per field, across the corpus. */
export function fieldTable(entries: EntryScore[], fields: string[]): string {
  const lines: string[] = [];
  lines.push(`${BOLD}per field${RESET}`);
  lines.push(
    `  ${pad("field", 14)}${pad("correct", 10)}${pad("missed", 9)}${pad("wrong", 8)}${pad("norm", 7)}accuracy`,
  );

  for (const field of fields) {
    const scores = entries.flatMap((entry) =>
      entry.fields.filter((score) => score.field === field),
    );
    const totals = tally(scores);
    const judged = totals.correct + totals.missed + totals.wrong;
    if (judged === 0) {
      lines.push(`  ${pad(field, 14)}${DIM}not adjudicated by this corpus${RESET}`);
      continue;
    }
    const colour = totals.wrong > 0 ? RED : totals.missed > 0 ? YELLOW : GREEN;
    lines.push(
      `  ${pad(field, 14)}${pad(String(totals.correct), 10)}${pad(String(totals.missed), 9)}` +
        `${pad(String(totals.wrong), 8)}${pad(String(totals.normalizedOnly), 7)}` +
        `${colour}${percent(accuracy(totals))}${RESET}`,
    );
  }
  return lines.join("\n");
}

/** Where each source went wrong, with the provenance that explains it. */
export function diffs(entries: EntryScore[]): string {
  const lines: string[] = [];
  const interesting = entries.filter(
    (entry) =>
      entry.failure ||
      entry.ungrounded.length > 0 ||
      !entry.idempotent ||
      entry.fields.some((score) => score.verdict === "wrong" || score.verdict === "missed"),
  );

  if (interesting.length === 0) return `${GREEN}every source matched its truth exactly${RESET}`;

  lines.push(`${BOLD}per source${RESET}`);
  for (const entry of interesting) {
    lines.push("");
    lines.push(`  ${BOLD}${basename(entry.source)}${RESET}${entry.note ? ` ${DIM}— ${entry.note}${RESET}` : ""}`);

    if (entry.failure) {
      lines.push(`    ${RED}failed${RESET}: ${entry.failure}`);
      continue;
    }
    if (!entry.idempotent) {
      lines.push(`    ${RED}not idempotent${RESET}: a second run changed the item`);
    }
    for (const field of entry.ungrounded) {
      lines.push(`    ${RED}ungrounded${RESET}: '${field}' was written without usable provenance`);
    }

    for (const score of entry.fields) {
      if (score.verdict === "correct" || score.verdict === "absent") continue;
      const via = score.method ? ` ${DIM}via ${score.method}${RESET}` : "";
      lines.push(`    ${MARK[score.verdict]} ${pad(score.field, 12)}`);
      lines.push(`        expected  ${show(score.expected)}`);
      lines.push(`        got       ${show(score.got)}${via}`);
    }
  }
  return lines.join("\n");
}

export function summary(entries: EntryScore[]): string {
  const totals = entries
    .map((entry) => tally(entry.fields))
    .reduce(addTotals, { correct: 0, missed: 0, wrong: 0, absent: 0, normalizedOnly: 0 });

  const failures = entries.filter((entry) => entry.failure).length;
  const notIdempotent = entries.filter((entry) => !entry.idempotent && !entry.failure).length;
  const ungrounded = entries.reduce((count, entry) => count + entry.ungrounded.length, 0);
  const duration = entries.reduce((total, entry) => total + entry.durationMs, 0);
  const wrong = wrongRate(totals);

  const lines = [
    `${BOLD}corpus${RESET}`,
    `  ${entries.length} sources, ${failures} failed to model`,
    `  ${totals.correct} correct, ${totals.missed} missed, ${totals.wrong} wrong` +
      ` ${DIM}(${totals.normalizedOnly} correct only after normalization)${RESET}`,
    `  accuracy      ${percent(accuracy(totals))} of adjudicated fields`,
    // The gate. Stated last and stated plainly: a partial item is
    // acceptable, a confidently wrong one is not.
    `  ${BOLD}wrong rate    ${wrong > 0 ? RED : GREEN}${percent(wrong)}${RESET} of populated fields`,
    `  ungrounded    ${ungrounded > 0 ? RED : GREEN}${ungrounded}${RESET} populated without provenance`,
    `  idempotency   ${notIdempotent > 0 ? RED : GREEN}${entries.length - failures - notIdempotent}/${entries.length - failures}${RESET} unchanged on a second run`,
    `  ${DIM}${Math.round(duration / Math.max(entries.length, 1))}ms per source${RESET}`,
  ];
  return lines.join("\n");
}

export function totalsOf(entries: EntryScore[]): Totals {
  return entries
    .map((entry) => tally(entry.fields))
    .reduce(addTotals, { correct: 0, missed: 0, wrong: 0, absent: 0, normalizedOnly: 0 });
}
