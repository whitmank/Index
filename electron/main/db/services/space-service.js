// Author: Claude Code
// space-service.js — evaluates space membership.
// Membership = (rule_or_query_results ∪ includes_edges) − excludes_edges
//
// Phase 2: a Space may carry either the legacy `query` (tag-id lists) or the
// new `rule` (graph-native { all, any, none } of { edge, to } predicates).
// When both are present, `rule` wins.
//
// rule_or_query_results: objects satisfying the space's membership rule
// includes_edges: objects explicitly added via RELATE parent->includes->child
// excludes_edges: objects explicitly removed via RELATE parent->excludes->child

import { escId } from '../surreal-utils.js';
import { compileRule } from '../rule-compiler.js';

/**
 * Evaluate the membership of a space object.
 *
 * @param {object} db - SurrealDB instance
 * @param {string} spaceId - Fully-qualified record ID string (e.g. "objects:abc")
 * @returns {Promise<object[]>} Normalized array of member object records
 */
export async function evaluateSpace(db, spaceId) {
  const safeId = escId(spaceId);
  // Fetch space record
  const spaceResult = await db.query(`SELECT * FROM ${safeId}`);
  let space = spaceResult[0];
  if (Array.isArray(space)) space = space[0];
  if (!space) throw new Error(`Space ${spaceId} not found`);

  const rule = space.rule || null;
  const query = space.query || null;

  // 1a. New-shape rule (graph-native). If present, compile and execute; this
  // takes precedence over the legacy query so a Phase-3 migrated space with
  // both still resolves correctly.
  const ruleMatchedIds = new Set();
  const compiledRule = compileRule(rule);

  if (compiledRule) {
    const result = await db.query(
      `SELECT id FROM objects WHERE (!space OR space = false) AND ${compiledRule}`
    );
    const rows = Array.isArray(result[0]) ? result[0] : [];
    for (const row of rows) {
      const id = row.id?.toString?.() ?? row.id;
      if (id) ruleMatchedIds.add(id);
    }
  }

  // 1b. Legacy tag + device query rules — only if no new-shape rule.
  const hasTagRules = !compiledRule && query && (query.all?.length || query.any?.length || query.none?.length);
  const hasDeviceRules = !compiledRule && query && (query.from_any?.length || query.from_none?.length);
  const hasRules = hasTagRules || hasDeviceRules;

  if (hasRules) {
    const objectsResult = await db.query('SELECT * FROM objects WHERE !space OR space = false');
    const allObjects = Array.isArray(objectsResult[0]) ? objectsResult[0] : [];

    for (const obj of allObjects) {
      const objId = obj.id?.toString?.() ?? obj.id;
      let matches = true;

      // Tag rules
      if (hasTagRules) {
        const tagsResult = await db.query(`SELECT out FROM tagged WHERE in = ${objId}`);
        const tagIds = new Set((tagsResult[0] || []).map(r => r.out?.toString?.() ?? r.out));

        if (query.all?.length && !query.all.every(t => tagIds.has(t))) matches = false;
        if (matches && query.any?.length && !query.any.some(t => tagIds.has(t))) matches = false;
        if (matches && query.none?.length && query.none.some(t => tagIds.has(t))) matches = false;
      }

      // Device rules
      if (matches && hasDeviceRules) {
        const devResult = await db.query(`SELECT out FROM sourced_from WHERE in = ${objId}`);
        const deviceIds = new Set((devResult[0] || []).map(r => r.out?.toString?.() ?? r.out));

        if (query.from_any?.length && !query.from_any.some(d => deviceIds.has(d))) matches = false;
        if (matches && query.from_none?.length && query.from_none.some(d => deviceIds.has(d))) matches = false;
      }

      if (matches) ruleMatchedIds.add(objId);
    }
  }

  // 2. Fetch explicit includes edges (ordered)
  // ORDER BY `order` is rejected by SurrealQL (reserved word in ORDER BY position); sort in JS.
  const includesResult = await db.query(
    `SELECT out, \`order\` FROM includes WHERE in = ${safeId}`
  );
  const includesIds = (includesResult[0] || [])
    .sort((a, b) => (a['order'] ?? 0) - (b['order'] ?? 0))
    .map(r => r.out?.toString?.() ?? r.out);

  // 3. Fetch explicit excludes edges
  const excludesResult = await db.query(
    `SELECT out FROM excludes WHERE in = ${safeId}`
  );
  const excludesIds = new Set((excludesResult[0] || []).map(r => r.out?.toString?.() ?? r.out));

  // 4. Union then subtract
  const finalIds = new Set([...ruleMatchedIds, ...includesIds]);
  excludesIds.forEach(id => finalIds.delete(id));

  if (finalIds.size === 0) return [];

  // 5. Fetch full object records
  const idList = [...finalIds].join(', ');
  const finalResult = await db.query(`SELECT * FROM [${idList}]`);
  return Array.isArray(finalResult[0]) ? finalResult[0] : [];
}
