// Author: Claude Code
// One-time migration from v0.3 JSON files to persistent SurrealDB.
// Runs on first launch of v0.4 if v0.3 data exists but no version file is present.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { verifyAndRepairSources } from '../utils/file-recovery.js';
import { repairMissingSystemTagsForAllObjects } from './repair.js';

const INDEX_DIR = path.join(os.homedir(), '.index');
const VERSION_FILE = path.join(INDEX_DIR, '.version');

/**
 * Run v0.3 → v0.4 migration if needed.
 * Detects v0.3 data by presence of ~/.index/objects/ without a .version file.
 */
export async function migrateFromV3IfNeeded(db) {
  if (fs.existsSync(VERSION_FILE)) {
    console.log('[Migration] Already migrated, skipping');
    return;
  }

  const objectsDir = path.join(INDEX_DIR, 'objects');
  if (fs.existsSync(objectsDir)) {
    console.log('[Migration] Detected v0.3 data, importing into SurrealDB...');
    await importFromJsonFiles(db);
    await repairMissingSystemTagsForAllObjects(db);
    console.log('[Migration] v0.3 data imported successfully');
  }

  fs.writeFileSync(VERSION_FILE, JSON.stringify({
    version: '0.4',
    migratedAt: new Date().toISOString(),
  }));

  console.log('[Migration] Version file written, migration complete');
}

async function importFromJsonFiles(db) {
  await hydrateTable(db, 'objects');
  await hydrateTable(db, 'tag_definitions');
  await hydrateTable(db, 'collections');
  // Migrate v0.3 tag_assignments join table records into RELATE edges
  await migrateTagAssignmentsToEdges(db);
}

/**
 * Convert v0.3 tag_assignments.json join records into tagged RELATE edges.
 * Each {object_id, tag_id} row becomes: RELATE object_id->tagged->tag_id
 */
async function migrateTagAssignmentsToEdges(db) {
  const filePath = path.join(INDEX_DIR, 'tag_assignments.json');
  if (!fs.existsSync(filePath)) return;

  try {
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(records)) return;

    let migrated = 0;
    for (const record of records) {
      try {
        const objectId = record.object_id;
        const tagId = record.tag_id;
        if (!objectId || !tagId) continue;
        await db.query(`RELATE ${objectId}->tagged->${tagId}`);
        migrated++;
      } catch (e) {
        console.warn('[Migration] Error migrating tag assignment:', e.message);
      }
    }

    if (migrated > 0) console.log(`[Migration] Migrated ${migrated} tag assignments to edges`);
  } catch (e) {
    console.error('[Migration] Error migrating tag_assignments:', e);
  }
}

async function hydrateTable(db, tableName) {
  const tableDir = path.join(INDEX_DIR, tableName);
  if (!fs.existsSync(tableDir)) return;

  const files = fs.readdirSync(tableDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return;

  let loadedObjects = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(tableDir, file), 'utf-8');
      loadedObjects.push(JSON.parse(content));
    } catch (e) {
      console.warn(`[Migration] Error loading ${file}:`, e.message);
    }
  }

  if (tableName === 'objects' && loadedObjects.length > 0) {
    loadedObjects = await verifyAndRepairSources(loadedObjects);
  }

  for (const obj of loadedObjects) {
    try {
      if (!obj.id) { console.warn('[Migration] Object missing ID, skipping'); continue; }

      let recordId = obj.id;
      if (typeof recordId === 'string' && recordId.includes(':')) {
        recordId = recordId.split(':')[1];
      }

      const { id, ...objWithoutId } = obj;
      await db.query(`CREATE ${tableName}:${recordId} CONTENT ${JSON.stringify(objWithoutId)}`);
    } catch (e) {
      console.warn('[Migration] Error inserting record:', e.message);
    }
  }
}

async function hydrateSingleFileTable(db, tableName, fileName) {
  const filePath = path.join(INDEX_DIR, fileName);
  if (!fs.existsSync(filePath)) return;

  try {
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(records)) return;

    for (const record of records) {
      try {
        if (!record.id) continue;

        let recordId = record.id;
        if (typeof recordId === 'string' && recordId.includes(':')) {
          recordId = recordId.split(':')[1];
        }

        const { id, ...recordWithoutId } = record;
        await db.query(`CREATE ${tableName}:${recordId} CONTENT ${JSON.stringify(recordWithoutId)}`);
      } catch (e) {
        console.warn(`[Migration] Error inserting ${tableName} record:`, e.message);
      }
    }
  } catch (e) {
    console.error(`[Migration] Error hydrating ${tableName}:`, e);
  }
}
