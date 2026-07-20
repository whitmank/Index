// Authored by Karter Whitman using Claude Opus 4.8
// Applying a change (PRODUCT-SPEC §1.7): every `{before, after}` pair of
// one change lands in a single transaction. The writer is blind — it puts
// the `after` states down as given, because there is exactly one writer
// and the caller already decided what the records should be.
//
// Undo is this same function over the same change with the pairs swapped,
// which is why `after: null` has to mean "remove the record": undoing a
// creation swaps `{before: null, after: record}` into
// `{before: record, after: null}`.
import { getDb } from "./db.js";
import { getItem } from "./records/items.js";
import { getConnection } from "./records/connections.js";
import { recordContent, recordId } from "./records/serialize.js";
import type { Change, ChangePair, StoredRecord } from "./types.js";
import { isConnection, isItem } from "./types.js";

/** The same change, read backwards. */
export function invert(change: Change): Change {
  return {
    description: change.description,
    pairs: change.pairs.map((pair) => ({ before: pair.after, after: pair.before })),
  };
}

interface Statement {
  sql: string;
  bindings: Record<string, unknown>;
}

/**
 * Writes are ordered so the graph is never momentarily inconsistent:
 * items appear before the connections that need them as endpoints
 * (`ENFORCED` on the relation table), and connections are removed before
 * the items they hang off.
 */
function orderOf(pair: ChangePair): number {
  const record = pair.after ?? pair.before;
  if (!record) return 4;
  const removing = pair.after === null;
  if (!removing) return isItem(record) ? 0 : 1;
  return isItem(record) ? 3 : 2;
}

function statementFor(pair: ChangePair, index: number): Statement | null {
  const idBinding = `id${index}`;

  if (pair.after === null) {
    const target = pair.before;
    if (!target) return null; // a pair with neither side says nothing
    return {
      sql: `DELETE $${idBinding};`,
      bindings: { [idBinding]: recordId(target.id) },
    };
  }

  const contentBinding = `content${index}`;
  const content = recordContent(pair.after, true);
  const creating = pair.before === null;

  // A relation record has to be *born* a relation: SurrealDB rejects an
  // UPSERT that would mint `connections:x` as an ordinary record on a
  // `TYPE RELATION … ENFORCED` table. Once it exists, CONTENT updates it
  // like anything else. Items have no such rule.
  if (creating && isConnection(pair.after)) {
    return {
      sql: `INSERT RELATION INTO connections $${contentBinding};`,
      bindings: { [contentBinding]: { ...content, id: recordId(pair.after.id) } },
    };
  }

  return {
    sql: creating
      ? `UPSERT $${idBinding} CONTENT $${contentBinding};`
      : `UPDATE $${idBinding} CONTENT $${contentBinding};`,
    bindings: {
      [idBinding]: recordId(pair.after.id),
      [contentBinding]: content,
    },
  };
}

/**
 * Apply a change and hand back the records as they now stand — the
 * renderer reconciles its optimistic copy against these. A record that
 * the change removed is simply absent from the result.
 */
export async function applyChange(change: Change): Promise<StoredRecord[]> {
  const pairs = [...change.pairs].sort((a, b) => orderOf(a) - orderOf(b));

  const statements: string[] = [];
  const bindings: Record<string, unknown> = {};

  pairs.forEach((pair, index) => {
    const statement = statementFor(pair, index);
    if (!statement) return;
    statements.push(statement.sql);
    Object.assign(bindings, statement.bindings);
  });

  if (statements.length === 0) return [];

  const db = getDb();
  const responses = await db
    .query(["BEGIN TRANSACTION;", ...statements, "COMMIT TRANSACTION;"].join("\n"), bindings)
    .responses();

  // A failed transaction reports every statement after the offending one
  // as "not executed", so the first real message is the only useful one —
  // surface that rather than the noise that follows it.
  for (const [index, response] of responses.entries()) {
    if (response.success) continue;
    const statement = statements[index - 1] ?? "the transaction";
    throw new Error(`change "${change.description}" failed at ${statement} ${response.error.message}`);
  }

  return readBack(pairs);
}

async function readBack(pairs: ChangePair[]): Promise<StoredRecord[]> {
  const written: StoredRecord[] = [];
  for (const pair of pairs) {
    if (!pair.after) continue;
    const fresh = isItem(pair.after)
      ? await getItem(pair.after.id)
      : await getConnection(pair.after.id);
    // A soft-deleted record reads back as null through the live filters;
    // the caller's own `after` is then the truthful answer.
    written.push(fresh ?? pair.after);
  }
  return written;
}
