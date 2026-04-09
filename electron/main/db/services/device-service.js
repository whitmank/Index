// Author: Claude Sonnet 4.6
// device-service.js — first-class device records and sourced_from edge management.
//
// devices table: each origin (Web, MacBook Pro, etc.) is a record.
// sourced_from edges: object → device, one per unique origin in sources array.
//
// devices:⟨web⟩ is a fixed-ID system device for all HTTP/HTTPS sources.

import { escId } from '../surreal-utils.js';

/**
 * Seed devices:⟨web⟩ if it does not exist.
 * Must run before any objects are created.
 * @param {import('surrealdb').Surreal} db
 */
export async function seedSystemDevices(db) {
  const existing = await db.query(`SELECT id FROM devices:⟨web⟩`);
  if (!existing[0] || existing[0].length === 0) {
    const now = new Date().toISOString();
    await db.query(`CREATE devices:⟨web⟩ CONTENT ${JSON.stringify({ name: 'Web', created_at: now })}`);
    console.log('[DeviceService] Seeded devices:⟨web⟩');
  }
}

/**
 * Find an existing device record by name, or create it.
 * 'Web' (case-insensitive) always maps to the fixed ID devices:⟨web⟩.
 * All other names get auto-generated IDs (upsert by name).
 *
 * @param {import('surrealdb').Surreal} db
 * @param {string} name
 * @returns {Promise<string>} Device record ID string
 */
export async function findOrCreateDevice(db, name) {
  if (!name) return null;

  if (name.toLowerCase() === 'web') {
    return 'devices:⟨web⟩';
  }

  const result = await db.query(`SELECT id FROM devices WHERE name = '${name.replace(/'/g, "\\'")}'`);
  const existing = result[0] || [];
  if (existing.length > 0) {
    return existing[0].id?.toString?.() ?? existing[0].id;
  }

  const now = new Date().toISOString();
  const created = await db.create('devices', { name, created_at: now });
  const record = Array.isArray(created) ? created[0] : created;
  return record.id?.toString?.() ?? record.id;
}

/**
 * Sync sourced_from edges for one object from its sources array.
 * Deletes all existing edges for this object, then recreates from current sources.
 * Idempotent — safe to call on create and on every update.
 *
 * @param {import('surrealdb').Surreal} db
 * @param {string} objectId  — fully qualified, e.g. 'objects:abc123'
 * @param {Array<{origin?: string}>} sources
 */
export async function syncSourcedFromEdges(db, objectId, sources) {
  const safeId = escId(objectId);

  // Remove all existing edges for this object
  await db.query(`DELETE FROM sourced_from WHERE in = ${safeId}`);

  if (!sources || sources.length === 0) return;

  // Collect unique non-empty origins
  const uniqueOrigins = [...new Set(sources.map(s => s.origin).filter(Boolean))];

  for (const origin of uniqueOrigins) {
    const deviceId = await findOrCreateDevice(db, origin);
    if (deviceId) {
      await db.query(`RELATE ${safeId}->sourced_from->${escId(deviceId)}`);
    }
  }
}

/**
 * Backfill sourced_from edges for all objects that have sources but no edges yet.
 * Runs at every boot. Skips objects that already have sourced_from edges.
 * Idempotent.
 *
 * @param {import('surrealdb').Surreal} db
 */
export async function backfillSourcedFromEdges(db) {
  const objectsResult = await db.query(`SELECT * FROM objects WHERE !space OR space = false`);
  const objects = Array.isArray(objectsResult[0]) ? objectsResult[0] : [];

  let backfilled = 0;

  for (const obj of objects) {
    const objectId = obj.id?.toString?.() ?? obj.id;
    const edgeCheck = await db.query(`SELECT id FROM sourced_from WHERE in = ${escId(objectId)}`);
    const hasEdges = edgeCheck[0] && edgeCheck[0].length > 0;

    if (!hasEdges && obj.sources?.length > 0) {
      await syncSourcedFromEdges(db, objectId, obj.sources);
      backfilled++;
    }
  }

  if (backfilled > 0) {
    console.log(`[DeviceService] Backfilled sourced_from edges for ${backfilled} objects`);
  }
}
