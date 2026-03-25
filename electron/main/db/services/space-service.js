// Author: Claude Code
// space-service.js — evaluates space membership.
// Membership = (query_results ∪ contains_edges) − excludes_edges
//
// query_results: objects satisfying the space's tag rules (all/any/none)
// contains_edges: objects explicitly added via RELATE parent->contains->child
// excludes_edges: objects explicitly removed via RELATE parent->excludes->child

import { escId } from '../surreal-utils.js';

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

  const query = space.query || null;

  // 1. Evaluate tag query rules against all non-space objects
  const ruleMatchedIds = new Set();
  const hasRules = query && (query.all?.length || query.any?.length || query.none?.length);

  if (hasRules) {
    const objectsResult = await db.query('SELECT * FROM objects WHERE !space OR space = false');
    const allObjects = Array.isArray(objectsResult[0]) ? objectsResult[0] : [];

    for (const obj of allObjects) {
      const objId = obj.id?.toString?.() ?? obj.id;

      // Fetch this object's tags via the tagged edge
      const tagsResult = await db.query(`SELECT out FROM tagged WHERE in = ${objId}`);
      const tagIds = new Set((tagsResult[0] || []).map(r => r.out?.toString?.() ?? r.out));

      let matches = true;
      if (query.all?.length && !query.all.every(t => tagIds.has(t))) matches = false;
      if (matches && query.any?.length && !query.any.some(t => tagIds.has(t))) matches = false;
      if (matches && query.none?.length && query.none.some(t => tagIds.has(t))) matches = false;

      if (matches) ruleMatchedIds.add(objId);
    }
  }

  // 2. Fetch explicit contains edges (ordered)
  // ORDER BY `order` is rejected by SurrealQL (reserved word in ORDER BY position); sort in JS.
  const containsResult = await db.query(
    `SELECT out, \`order\` FROM contains WHERE in = ${safeId}`
  );
  const containsIds = (containsResult[0] || [])
    .sort((a, b) => (a['order'] ?? 0) - (b['order'] ?? 0))
    .map(r => r.out?.toString?.() ?? r.out);

  // 3. Fetch explicit excludes edges
  const excludesResult = await db.query(
    `SELECT out FROM excludes WHERE in = ${safeId}`
  );
  const excludesIds = new Set((excludesResult[0] || []).map(r => r.out?.toString?.() ?? r.out));

  // 4. Union then subtract
  const finalIds = new Set([...ruleMatchedIds, ...containsIds]);
  excludesIds.forEach(id => finalIds.delete(id));

  if (finalIds.size === 0) return [];

  // 5. Fetch full object records
  const idList = [...finalIds].join(', ');
  const finalResult = await db.query(`SELECT * FROM [${idList}]`);
  return Array.isArray(finalResult[0]) ? finalResult[0] : [];
}
