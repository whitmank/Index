// Author: Claude Opus 4.7
// edge-service.js — thin read/write layer over the unified edge model.
//
// Phase 1 scope: re-export addEdge/removeEdge and expose reads that the debug
// IPC handler uses to verify migration output. Phase 2 will replace the
// legacy tag-assignment helpers with this module.

import { addEdge, removeEdge } from '../edges.js';
import { escId } from '../surreal-utils.js';

export { addEdge, removeEdge };

/**
 * Outbound edges from `fromId` on the given edge table.
 * @param {import('surrealdb').Surreal} db
 * @param {string} edgeName
 * @param {string} fromId
 * @returns {Promise<Array>} raw edge rows
 */
export async function getEdgesFrom(db, edgeName, fromId) {
  const res = await db.query(
    `SELECT * FROM ${edgeName} WHERE in = ${escId(fromId)}`
  );
  return res[0] || [];
}

/**
 * Inbound edges to `toId` on the given edge table.
 */
export async function getEdgesTo(db, edgeName, toId) {
  const res = await db.query(
    `SELECT * FROM ${edgeName} WHERE out = ${escId(toId)}`
  );
  return res[0] || [];
}

/**
 * Resolve the pills for an Object by walking the new-shape graph:
 *   1. obj -> type -> typeObject
 *   2. typeObject.schema → [edgeObject, edgeObject, ...]
 *   3. For each edge Object, SELECT * FROM <edgeName> WHERE in = obj
 *   4. Resolve the target's name.
 *
 * Returns an array of pill descriptors in schema order. Edges with no outbound
 * rows for this object produce no entries (they are hidden, like today's UI).
 *
 * @param {import('surrealdb').Surreal} db
 * @param {string} objectId
 * @returns {Promise<Array<{edge: string, edgeObjectId: string, edgeName: string, targetId: string, targetName: string}>>}
 */
export async function getPillsForObject(db, objectId) {
  const objSafe = escId(objectId);

  // Step 1: find the type Object for this Object.
  const typeRes = await db.query(
    `SELECT out FROM type WHERE in = ${objSafe}`
  );
  const typeObjectId = typeRes[0]?.[0]?.out?.toString?.() ?? typeRes[0]?.[0]?.out;
  if (!typeObjectId) return [];

  // Step 2: read the type Object's schema array.
  const typeObjRes = await db.query(`SELECT schema FROM ${escId(typeObjectId)}`);
  const schema = typeObjRes[0]?.[0]?.schema || [];
  if (schema.length === 0) return [];

  const pills = [];

  // Step 3: for each edge Object in schema, query its edge table and resolve targets.
  for (const edgeRef of schema) {
    const edgeObjectId = edgeRef?.toString?.() ?? edgeRef;
    // The edge table name is the Object's stem — objects:⟨author⟩ → `author`.
    const edgeName = edgeObjectId.replace(/^objects:⟨?/, '').replace(/⟩?$/, '');

    // Fetch edge Object metadata.
    const edgeObjRes = await db.query(`SELECT name FROM ${escId(edgeObjectId)}`);
    const edgeObjName = edgeObjRes[0]?.[0]?.name ?? edgeName;

    // Rows on this edge from the current Object.
    const rowsRes = await db.query(
      `SELECT out FROM ${edgeName} WHERE in = ${objSafe}`
    );
    const rows = rowsRes[0] || [];

    for (const row of rows) {
      const targetId = row.out?.toString?.() ?? row.out;
      if (!targetId) continue;

      const targetRes = await db.query(`SELECT name FROM ${escId(targetId)}`);
      const targetName = targetRes[0]?.[0]?.name ?? null;

      pills.push({
        edge: edgeName,
        edgeObjectId,
        edgeName: edgeObjName,
        targetId,
        targetName,
      });
    }
  }

  return pills;
}
