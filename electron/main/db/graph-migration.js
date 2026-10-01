// Author: Claude Opus 4.7
// graph-migration.js — Phase 2 boot-time dual-write migration.
//
// Mirrors the legacy two-hop `tagged` + `typed` shape into first-class per-edge
// RELATION tables. Legacy rows are left intact so the app keeps reading them
// until Phase 3 removes them.
//
// Scope:
//   • Seed objects:⟨book|document|image|video|audio⟩ with their pill schemas.
//   • For every non-space object, walk its `tagged` edges and emit the
//     corresponding new-shape edge whenever the tag's type matches a known
//     field edge or system-tag edge.
//   • Slugified IDs for value Objects: objects:⟨andy_weir⟩, objects:⟨epub⟩, …
//
// Also exports mirrorTaggedRow / unmirrorTaggedRow so the IPC handlers can
// dual-write on every mutation (see db-handlers.js).

import { seedSystemEdges } from './edges.js';
import { escId } from './surreal-utils.js';

// Built-in type schemas — ordered list of field edge names displayed as pills.
// Mirrors TYPE_SCHEMAS in connection.js. The two must stay in sync until
// Phase 3 drops the legacy tag_definitions seeding path.
const TYPE_SCHEMAS = {
  book:     ['author', 'published', 'genre', 'isbn'],
  document: ['author', 'published', 'publisher'],
  image:    ['creator', 'captured'],
  video:    ['director', 'released', 'duration'],
  audio:    ['artist', 'album', 'released'],
};

const TYPE_ICONS = {
  book:     'square',
  document: 'bar',
  image:    'diamond',
  video:    'triangle',
  audio:    'wave',
};

// Known field edge names (per-type schemas) and promoted system-tag edges.
// Any `tagged` row whose tag's type is in this set gets mirrored into the
// matching edge table. Unknown tag types are ignored until user-editable
// schemas land.
const FIELD_EDGE_NAMES = new Set([
  'author', 'genre', 'published', 'isbn', 'publisher',
  'creator', 'captured', 'director', 'released', 'duration',
  'artist', 'album',
]);

const SYSTEM_EDGE_NAMES = new Set(['medium', 'file', 'origin']);

function slugify(name) {
  if (name == null) return null;
  const s = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s.length > 0 ? s : null;
}

async function ensureValueObject(db, slug, name, { system = false } = {}) {
  const id = `objects:⟨${slug}⟩`;
  const existing = await db.query(`SELECT id FROM ${id}`);
  if (existing[0] && existing[0].length > 0) return { id, created: false };

  const now = new Date().toISOString();
  const content = { name, created_at: now, updated_at: now };
  if (system) content.system = true;
  await db.query(`CREATE ${id} CONTENT ${JSON.stringify(content)}`);
  return { id, created: true };
}

async function edgeExists(db, edgeName, fromSafe, toId) {
  const res = await db.query(
    `SELECT id FROM ${edgeName} WHERE in = ${fromSafe} AND out = ${toId}`
  );
  return !!(res[0] && res[0].length > 0);
}

/**
 * Seed the built-in type Objects (book, document, image, video, audio) with
 * their pill schemas. Idempotent — refreshes schema on each boot so changes to
 * TYPE_SCHEMAS propagate without a manual migration.
 */
async function seedBuiltinTypeObjects(db) {
  for (const typeName of Object.keys(TYPE_SCHEMAS)) {
    const typeObjId = `objects:⟨${typeName}⟩`;

    const existing = await db.query(`SELECT id FROM ${typeObjId}`);
    if (!existing[0] || existing[0].length === 0) {
      const now = new Date().toISOString();
      await db.query(`CREATE ${typeObjId} CONTENT ${JSON.stringify({
        name: typeName,
        system: true,
        icon: TYPE_ICONS[typeName] || null,
        created_at: now,
        updated_at: now,
      })}`);
      console.log(`[GraphMigration] Seeded ${typeObjId}`);
    }

    // Always refresh schema — pill rendering reads it on every view.
    const fields = TYPE_SCHEMAS[typeName];
    const schemaRefs = ['objects:⟨type⟩', ...fields.map(f => `objects:⟨${f}⟩`)];
    await db.query(`UPDATE ${typeObjId} SET schema = [${schemaRefs.join(', ')}]`);
  }
}

/**
 * Resolve a legacy tag into a new-shape (edgeName, valueObjectId) pair, or
 * null if the tag has no known mapping.
 */
async function resolveTagEdge(db, tagId, tagName) {
  const typedRes = await db.query(`SELECT out FROM typed WHERE in = ${tagId}`);
  const typeRef = typedRes[0]?.[0]?.out?.toString?.() ?? typedRes[0]?.[0]?.out;
  if (!typeRef) return null;

  const typeName = typeRef.replace(/^tag_types:/, '').replace(/⟨|⟩/g, '');
  const slug = slugify(tagName);
  if (!slug) return null;

  if (typeName === 'type') {
    return {
      edgeName: 'type',
      valueObjectId: `objects:⟨${slug}⟩`,
      isTypeEdge: true,
    };
  }

  if (FIELD_EDGE_NAMES.has(typeName) || SYSTEM_EDGE_NAMES.has(typeName)) {
    return {
      edgeName: typeName,
      valueObjectId: `objects:⟨${slug}⟩`,
      isTypeEdge: false,
      isSystem: SYSTEM_EDGE_NAMES.has(typeName),
    };
  }

  return null;
}

/**
 * Mirror one legacy `tagged` row into its new-shape edge. Idempotent.
 *
 * @param {import('surrealdb').Surreal} db
 * @param {string} objectId       fully-qualified objects:… id
 * @param {string} tagId          fully-qualified tag_definitions:… id
 * @param {string|null} tagName   display name; fetched if omitted
 * @returns {{created: boolean, edgeName: string|null, valueCreated: boolean}}
 */
export async function mirrorTaggedRow(db, objectId, tagId, tagName = null) {
  let name = tagName;
  if (name == null) {
    const tagRec = await db.query(`SELECT name FROM ${tagId}`);
    name = tagRec[0]?.[0]?.name;
  }

  const mapping = await resolveTagEdge(db, tagId, name);
  if (!mapping) return { created: false, edgeName: null, valueCreated: false };

  const objSafe = escId(objectId);
  const slug = mapping.valueObjectId.replace(/^objects:⟨/, '').replace(/⟩$/, '');
  const { created: valueCreated } = await ensureValueObject(
    db, slug, name, { system: mapping.isTypeEdge || mapping.isSystem }
  );

  if (await edgeExists(db, mapping.edgeName, objSafe, mapping.valueObjectId)) {
    return { created: false, edgeName: mapping.edgeName, valueCreated };
  }

  await db.query(`RELATE ${objSafe}->${mapping.edgeName}->${mapping.valueObjectId}`);
  return { created: true, edgeName: mapping.edgeName, valueCreated };
}

/**
 * Remove the mirror edge for a legacy unassignment. Best-effort.
 */
export async function unmirrorTaggedRow(db, objectId, tagId, tagName = null) {
  let name = tagName;
  if (name == null) {
    const tagRec = await db.query(`SELECT name FROM ${tagId}`);
    name = tagRec[0]?.[0]?.name;
  }
  const mapping = await resolveTagEdge(db, tagId, name);
  if (!mapping) return { removed: false, edgeName: null };

  await db.query(
    `DELETE FROM ${mapping.edgeName}
     WHERE in = ${escId(objectId)} AND out = ${mapping.valueObjectId}`
  );
  return { removed: true, edgeName: mapping.edgeName };
}

/**
 * Boot-time migration. Idempotent, safe to run every startup.
 */
export async function runGraphMigration(db) {
  await seedSystemEdges(db);
  await seedBuiltinTypeObjects(db);

  const objectsRes = await db.query(
    `SELECT id FROM objects WHERE (!space OR space = false) AND (!system OR system = false)`
  );
  const objects = Array.isArray(objectsRes[0]) ? objectsRes[0] : [];

  const stats = {
    objects: objects.length,
    mirrored_edges: 0,
    value_objects_created: 0,
    skipped_untyped: 0,
  };

  for (const obj of objects) {
    const objId = obj.id?.toString?.() ?? obj.id;
    const objSafe = escId(objId);

    const taggedRes = await db.query(
      `SELECT out FROM tagged WHERE in = ${objSafe}`
    );
    const tagIds = (taggedRes[0] || [])
      .map(r => r.out?.toString?.() ?? r.out)
      .filter(Boolean);

    for (const tagId of tagIds) {
      const tagRec = await db.query(`SELECT name FROM ${tagId}`);
      const tagName = tagRec[0]?.[0]?.name;

      const { created, edgeName, valueCreated } = await mirrorTaggedRow(
        db, objId, tagId, tagName
      );
      if (created) stats.mirrored_edges += 1;
      if (valueCreated) stats.value_objects_created += 1;
      if (!edgeName) stats.skipped_untyped += 1;
    }
  }

  console.log(
    `[GraphMigration] complete — objects walked: ${stats.objects}, ` +
    `new edges: ${stats.mirrored_edges}, ` +
    `value Objects created: ${stats.value_objects_created}, ` +
    `untyped tags skipped: ${stats.skipped_untyped}`
  );

  return stats;
}
