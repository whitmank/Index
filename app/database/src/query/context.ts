// Authored by Karter Whitman using Claude Sonnet 5
// Assembles the one piece of MatchContext that needs the database: which
// items hold a live `member of` arrow into each `arrowTo` predicate's
// target, gathered once per evaluation pass rather than once per item.
// Everything else `matches()` needs comes straight off the item itself.
//
// This is the only file in `query/` that touches the database, and it
// does so only by calling into `records/` — never with SurrealQL of its
// own, so `records/` stays the one place that's actually written.
import { listArrowSourcesInto } from "../records/connections.js";
import type { SetQuery } from "../types.js";
import type { MatchContext } from "./evaluate.js";

export async function buildContext(query: SetQuery): Promise<MatchContext> {
  const targets = new Set<string>();
  collectArrowTargets(query, targets);

  const arrowSources = new Map<string, Set<string>>();
  await Promise.all(
    [...targets].map(async (target) => {
      arrowSources.set(target, new Set(await listArrowSourcesInto(target)));
    }),
  );
  return { arrowSources };
}

function collectArrowTargets(query: SetQuery, into: Set<string>): void {
  if ("and" in query) {
    for (const sub of query.and) collectArrowTargets(sub, into);
    return;
  }
  if ("or" in query) {
    for (const sub of query.or) collectArrowTargets(sub, into);
    return;
  }
  if ("not" in query) {
    collectArrowTargets(query.not, into);
    return;
  }
  if ("arrowTo" in query) into.add(query.arrowTo);
}
