// Author: Claude Opus 4.7
// Edge helper — per-edge RELATION tables with twin edge Objects.
//
// Every semantic relation is its own RELATION table (author, genre, type, ...).
// Every edge table has a twin Object in `objects` sharing its name, used for:
//   - display metadata (name, icon, description)
//   - pill navigation targets
//   - schema references from type-Objects
//
// Phase 1 scope: bootstrap pilot edges for the `book` type alongside legacy
// tagged/typed/excludes/sourced_from plus the unified `includes` edge.
// Nothing is removed.

import { escId } from './surreal-utils.js';

/**
 * Seeded system edges. Each entry becomes:
 *   DEFINE TABLE <name> TYPE RELATION FROM objects TO objects SCHEMALESS;
 *   DEFINE INDEX <name>_unique  ON <name> FIELDS in, out UNIQUE;
 *   DEFINE INDEX <name>_reverse ON <name> FIELDS out;
 *   CREATE objects:⟨<name>⟩ SET name=<name>, system=true, icon?, description?;
 *
 * Metadata fields (Stage 3B) power the renderer's tag-type surfaces:
 *   kind       — 'classification' | 'field' | 'system' | 'structural'
 *   label      — display name (defaults to name)
 *   display    — show in the main tag-type list (defaults to true)
 *   editable   — user may add/remove values (defaults to true)
 *   deletable  — user may delete the edge/type (defaults to false for system)
 *   order      — display order (lower first)
 *
 * Structural edges (`includes`, `excludes`, `sourced_from`) are hidden from
 * the tag-type list; field edges are hidden (shown via type schema instead).
 */
export const SYSTEM_EDGES = [
  // Primary classification
  { name: 'type',         kind: 'classification', label: 'Type', description: 'Object → primary type classification',
    display: true,  editable: true,  deletable: false, order: 0, icon: null },

  // Field edges used by built-in type schemas — hidden from main tag-type list
  { name: 'author',       kind: 'field', label: 'Author',    description: 'Object → authoring entity',
    display: false, editable: true,  deletable: false, order: 10, icon: null },
  { name: 'genre',        kind: 'field', label: 'Genre',     description: 'Object → genre classification',
    display: false, editable: true,  deletable: false, order: 11, icon: null },
  { name: 'published',    kind: 'field', label: 'Published', description: 'Object → publication date',
    display: false, editable: true,  deletable: false, order: 12, icon: null },
  { name: 'isbn',         kind: 'field', label: 'ISBN',      description: 'Object → ISBN identifier',
    display: false, editable: true,  deletable: false, order: 13, icon: null },
  { name: 'publisher',    kind: 'field', label: 'Publisher', description: 'Object → publisher',
    display: false, editable: true,  deletable: false, order: 14, icon: null },
  { name: 'creator',      kind: 'field', label: 'Creator',   description: 'Object → creator (image credit)',
    display: false, editable: true,  deletable: false, order: 15, icon: null },
  { name: 'captured',     kind: 'field', label: 'Captured',  description: 'Object → capture timestamp',
    display: false, editable: true,  deletable: false, order: 16, icon: null },
  { name: 'director',     kind: 'field', label: 'Director',  description: 'Object → director',
    display: false, editable: true,  deletable: false, order: 17, icon: null },
  { name: 'released',     kind: 'field', label: 'Released',  description: 'Object → release date',
    display: false, editable: true,  deletable: false, order: 18, icon: null },
  { name: 'duration',     kind: 'field', label: 'Duration',  description: 'Object → runtime',
    display: false, editable: true,  deletable: false, order: 19, icon: null },
  { name: 'artist',       kind: 'field', label: 'Artist',    description: 'Object → artist',
    display: false, editable: true,  deletable: false, order: 20, icon: null },
  { name: 'album',        kind: 'field', label: 'Album',     description: 'Object → album',
    display: false, editable: true,  deletable: false, order: 21, icon: null },

  // Promoted legacy system tag types — visible in main tag-type list
  { name: 'medium',       kind: 'system', label: 'Medium', description: 'Object → signal format (audio/video/image/text)',
    display: true,  editable: false, deletable: false, order: 30, icon: null },
  { name: 'file',         kind: 'system', label: 'File',   description: 'Object → file extension',
    display: true,  editable: true,  deletable: false, order: 31, icon: null },
  { name: 'origin',       kind: 'system', label: 'Origin', description: 'Object → origin (device or host)',
    display: true,  editable: false, deletable: false, order: 32, icon: null },

  // Structural edges — hidden from tag surfaces
  { name: 'includes',     kind: 'structural', label: 'Includes',    description: 'Space → manually included member (with order)',
    display: false, editable: false, deletable: false, order: 90, icon: null },
  { name: 'excludes',     kind: 'structural', label: 'Excludes',    description: 'Space → manually excluded member',
    display: false, editable: false, deletable: false, order: 91, icon: null },
  { name: 'sourced_from', kind: 'structural', label: 'Sourced from', description: 'Object → device/origin of capture',
    display: false, editable: false, deletable: false, order: 92, icon: null },
];

/**
 * Idempotently create an edge table + its indexes + its twin Object.
 *
 * @param {import('surrealdb').Surreal} db
 * @param {string} name  - Edge name (table name and twin Object key)
 * @param {{icon?: string, description?: string, system?: boolean}} [opts]
 */
export async function createEdge(db, name, opts = {}) {
  const { icon = null, description = null, system = true } = opts;

  // 1. Edge table
  try {
    await db.query(`DEFINE TABLE ${name} TYPE RELATION FROM objects TO objects SCHEMALESS`);
  } catch (error) {
    if (!error.message?.includes('already exists')) throw error;
  }

  // 2. Unique (forward + uniqueness) index on (in, out)
  try {
    await db.query(`DEFINE INDEX ${name}_unique ON ${name} FIELDS in, out UNIQUE`);
  } catch (error) {
    if (!error.message?.includes('already exists')) throw error;
  }

  // 3. Reverse index on out (for <-edge<- traversal)
  try {
    await db.query(`DEFINE INDEX ${name}_reverse ON ${name} FIELDS out`);
  } catch (error) {
    if (!error.message?.includes('already exists')) throw error;
  }

  // 4. Twin Object in `objects`, keyed by name
  const twinId = `objects:⟨${name}⟩`;
  const existing = await db.query(`SELECT id FROM ${twinId}`);
  if (!existing[0] || existing[0].length === 0) {
    const now = new Date().toISOString();
    const record = {
      name,
      system,
      created_at: now,
      updated_at: now,
    };
    if (icon)        record.icon = icon;
    if (description) record.description = description;
    await db.query(`CREATE ${twinId} CONTENT ${JSON.stringify(record)}`);
    console.log(`[Edges] Seeded ${twinId}`);
  }
}

/**
 * Seed every edge in SYSTEM_EDGES. Idempotent.
 * @param {import('surrealdb').Surreal} db
 */
export async function seedSystemEdges(db) {
  for (const spec of SYSTEM_EDGES) {
    await createEdge(db, spec.name, {
      icon: spec.icon,
      description: spec.description,
      system: true,
    });
  }
  console.log(`[Edges] seedSystemEdges complete (${SYSTEM_EDGES.length} edges)`);
}

/**
 * RELATE helper. `fields` is an optional object of per-row data.
 * @param {import('surrealdb').Surreal} db
 * @param {string} edgeName
 * @param {string} fromId - e.g. 'objects:abc'
 * @param {string} toId   - e.g. 'objects:xyz'
 * @param {object} [fields]
 */
export async function addEdge(db, edgeName, fromId, toId, fields = null) {
  const from = escId(fromId);
  const to   = escId(toId);
  const setClause = fields && Object.keys(fields).length > 0
    ? ` CONTENT ${JSON.stringify(fields)}`
    : '';
  return db.query(`RELATE ${from}->${edgeName}->${to}${setClause}`);
}

/**
 * Remove a single edge. Matches on (in, out).
 * @param {import('surrealdb').Surreal} db
 * @param {string} edgeName
 * @param {string} fromId
 * @param {string} toId
 */
export async function removeEdge(db, edgeName, fromId, toId) {
  const from = escId(fromId);
  const to   = escId(toId);
  return db.query(`DELETE FROM ${edgeName} WHERE in = ${from} AND out = ${to}`);
}
