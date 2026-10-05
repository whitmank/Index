// Author: Claude Opus 4.7
// rule-compiler.js — translate a graph-native Space rule into a SurrealQL
// WHERE fragment. Pure function, no DB access.
//
// Rule shape (from docs/data-model-proposal.md § Rule grammar):
//   {
//     all:  [ { edge: <edgeName>, to: <objectId> | "*" }, … ],
//     any:  [ ... ],                 // OR — empty means "no any constraint"
//     none: [ ... ],                 // NOT OR — empty means "no exclusions"
//   }
//
// Compiled form (one example):
//   (id IN (SELECT VALUE in FROM type WHERE out = objects:⟨book⟩))
//   AND ((id IN (SELECT VALUE in FROM author WHERE out = objects:⟨andy_weir⟩))
//        OR (id IN (SELECT VALUE in FROM author WHERE out = objects:⟨simmons⟩)))
//   AND NOT ((id IN (SELECT VALUE in FROM genre WHERE out = objects:⟨textbook⟩)))
//
// Edge names are validated against SYSTEM_EDGES so a malformed rule cannot
// inject arbitrary SurrealQL via a table name.

import { SYSTEM_EDGES } from './edges.js';
import { escId } from './surreal-utils.js';

export const KNOWN_EDGE_NAMES = new Set(SYSTEM_EDGES.map(e => e.name));

/**
 * Build a SurrealQL predicate for a single { edge, to } rule term.
 * @returns {string} SurrealQL expression returning bool per row.
 */
function compilePredicate({ edge, to }) {
  if (!edge || typeof edge !== 'string') {
    throw new Error(`Rule predicate missing edge name: ${JSON.stringify({ edge, to })}`);
  }
  if (!KNOWN_EDGE_NAMES.has(edge)) {
    throw new Error(`Rule predicate references unknown edge "${edge}". Known: ${[...KNOWN_EDGE_NAMES].join(', ')}`);
  }

  if (to === '*' || to == null) {
    // "has any outbound edge on this relation"
    return `id IN (SELECT VALUE in FROM ${edge})`;
  }

  if (typeof to !== 'string') {
    throw new Error(`Rule predicate "to" must be a string record id or "*", got ${typeof to}`);
  }

  return `id IN (SELECT VALUE in FROM ${edge} WHERE out = ${escId(to)})`;
}

/**
 * Compile a rule into a SurrealQL WHERE fragment. Returns null if the rule is
 * empty or absent — callers should treat null as "no rule-side contribution".
 *
 * @param {object|null|undefined} rule
 * @returns {string|null}
 */
export function compileRule(rule) {
  if (!rule || typeof rule !== 'object') return null;

  const all  = Array.isArray(rule.all)  ? rule.all  : [];
  const any  = Array.isArray(rule.any)  ? rule.any  : [];
  const none = Array.isArray(rule.none) ? rule.none : [];

  if (all.length === 0 && any.length === 0 && none.length === 0) return null;

  const clauses = [];

  if (all.length > 0) {
    clauses.push(all.map(p => `(${compilePredicate(p)})`).join(' AND '));
  }

  if (any.length > 0) {
    clauses.push(`(${any.map(p => `(${compilePredicate(p)})`).join(' OR ')})`);
  }

  if (none.length > 0) {
    clauses.push(`NOT (${none.map(p => `(${compilePredicate(p)})`).join(' OR ')})`);
  }

  return clauses.join(' AND ');
}
