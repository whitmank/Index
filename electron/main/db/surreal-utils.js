// Author: Claude Sonnet 4.6
// surreal-utils.js — helpers for building safe SurrealQL query strings.

/**
 * Escape a record ID for safe interpolation into a raw SurrealQL string.
 * SurrealQL requires non-alphanumeric key parts to be wrapped in ⟨⟩.
 * Plain IDs like "objects:root" or "objects:all" pass through unchanged.
 *
 * @param {string} id - Fully-qualified record ID, e.g. "objects:~"
 * @returns {string} SurrealQL-safe ID, e.g. "objects:⟨~⟩"
 */
export function escId(id) {
  const colonIdx = id.indexOf(':');
  if (colonIdx === -1) return id;
  const table = id.slice(0, colonIdx);
  const key   = id.slice(colonIdx + 1);
  if (/^[a-zA-Z0-9_]+$/.test(key)) return id;   // plain identifier — no escaping needed
  if (key.startsWith('⟨') && key.endsWith('⟩')) return id; // already escaped
  return `${table}:⟨${key}⟩`;
}
