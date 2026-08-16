// Authored by Karter Whitman using Claude Opus 5
// The numbers a run produces about itself.
//
// The spec's metric list, with one rule over all of it: **no source text
// and no field values leave here.** A modeling run reads people's private
// libraries, and an observability channel that carried excerpts would
// turn every log line into a copy of what was read. Counts, durations,
// codes and field *names* — never values.
//
// Counting is the point rather than logging: the question this pass
// exists to answer is how well deterministic extraction actually does,
// and that is a rate over a corpus, not a stream of messages.
import type { FieldChange } from "../contracts/changes.js";
import type { ModelingWarning } from "../contracts/warnings.js";

export interface ModelingCounts {
  claims: { total: number; deterministic: number; languageModel: number; rejected: number };
  actions: Record<string, number>;
  warnings: Record<string, number>;
  /** Fields the schema declares that ended up with nothing. The
   * complement of the fill rate, and the more useful half when deciding
   * what a later extraction model is actually for. */
  unfilled: string[];
}

export function countActions(changes: FieldChange[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const change of changes) counts[change.action] = (counts[change.action] ?? 0) + 1;
  return counts;
}

export function countWarnings(warnings: ModelingWarning[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const warning of warnings) counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  return counts;
}

/**
 * A one-line summary safe to print anywhere. Field names appear; field
 * values never do.
 */
export function summarize(counts: ModelingCounts, durationMs: number): string {
  const actions = Object.entries(counts.actions)
    .map(([action, count]) => `${action}=${count}`)
    .join(" ");
  return `${counts.claims.total} claims (${counts.claims.rejected} rejected) ${actions} in ${durationMs}ms`;
}
