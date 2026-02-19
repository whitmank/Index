import fs from 'fs';
import path from 'path';
import os from 'os';
import { verifyAndRepairSources } from '../utils/file-recovery.js';

// Author: Claude Code
// Hydration service - loads data from .index/ JSON files into database

const INDEX_DIR = path.join(os.homedir(), '.index');
const SINGLE_FILE_TABLES = {
  tag_assignments: 'tag_assignments.json',
};

/**
 * Hydrate database from .index/ JSON files
 * Loads all objects, relationships, and tags into the database
 * @param {Surreal} db - Database connection
 * @returns {Promise<void>}
 */
export async function hydrateFromIndex(db) {
  if (!db) {
    console.warn('[Hydration] No database connection available');
    return;
  }

  try {
    console.log('[Hydration] Starting hydration from .index/ files...');

    // Database is fresh (ephemeral), hydrate from local files
    await hydrateTable(db, 'objects');
    await hydrateTable(db, 'tag_definitions');
    await hydrateTable(db, 'collections');
    await hydrateSingleFileTable(db, 'tag_assignments', SINGLE_FILE_TABLES.tag_assignments);

    console.log('[Hydration] Hydration complete');
  } catch (error) {
    console.error('[Hydration] Failed to hydrate:', error);
    throw error;
  }
}

/**
 * Hydrate a table stored as a single JSON file
 * @private
 */
async function hydrateSingleFileTable(db, tableName, fileName) {
  const filePath = path.join(INDEX_DIR, fileName);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`[Hydration] No ${fileName} file found, skipping`);
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = JSON.parse(content);

    if (!Array.isArray(records)) {
      console.warn(`[Hydration] ${fileName} is not an array, skipping`);
      return;
    }

    console.log(`[Hydration] Found ${records.length} ${tableName} records`);

    let insertedCount = 0;

    for (const record of records) {
      try {
        if (!record.id) {
          console.warn('[Hydration] Record missing ID, skipping');
          continue;
        }

        // Extract recordId from id string (format: "object_tags:abc123" or just "abc123")
        let recordId = record.id;
        if (typeof recordId === 'string' && recordId.includes(':')) {
          recordId = recordId.split(':')[1];
        }

        // Remove id field to avoid conflict
        const { id, ...recordWithoutId } = record;

        // Insert with exact ID
        await db.query(`CREATE ${tableName}:${recordId} CONTENT ${JSON.stringify(recordWithoutId)}`);
        insertedCount++;
      } catch (error) {
        console.warn(`[Hydration] Error inserting ${tableName} record:`, error.message);
        // Continue with next record
      }
    }

    console.log(`[Hydration] Loaded ${insertedCount} ${tableName}`);
  } catch (error) {
    console.error(`[Hydration] Error hydrating ${tableName}:`, error);
    throw error;
  }
}

/**
 * Hydrate a single table from JSON files
 * @private
 */
async function hydrateTable(db, tableName) {
  const tableDir = path.join(INDEX_DIR, tableName);

  // Check if directory exists
  if (!fs.existsSync(tableDir)) {
    console.log(`[Hydration] No ${tableName} directory found, skipping`);
    return;
  }

  try {
    // Read all JSON files in the directory
    const files = fs.readdirSync(tableDir).filter((f) => f.endsWith('.json'));

    console.log(`[Hydration] Found ${files.length} ${tableName} files:`, files);

    if (files.length === 0) {
      console.log(`[Hydration] No ${tableName} files found`);
      return;
    }

    // Load all files first
    let loadedObjects = [];
    let insertedCount = 0;

    for (const file of files) {
      try {
        const filePath = path.join(tableDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const obj = JSON.parse(content);
        loadedObjects.push(obj);
      } catch (error) {
        console.warn(`[Hydration] Error loading ${file}:`, error.message);
        // Continue with next file
      }
    }

    // For objects, verify and repair file sources before inserting
    if (tableName === 'objects' && loadedObjects.length > 0) {
      console.log('[Hydration] Verifying and repairing object file sources...');
      loadedObjects = await verifyAndRepairSources(loadedObjects);
    }

    // Insert into database, preserving original IDs
    for (const obj of loadedObjects) {
      try {
        if (!obj.id) {
          console.warn('[Hydration] Object missing ID, skipping');
          continue;
        }

        // Extract recordId from id string (format: "objects:abc123" or just "abc123")
        let recordId = obj.id;
        if (typeof recordId === 'string' && recordId.includes(':')) {
          recordId = recordId.split(':')[1];
        }

        // Remove id field from object to avoid conflict with CREATE command
        const { id, ...objWithoutId } = obj;

        // Insert with exact ID using SurrealQL to preserve the original record ID
        // This prevents duplicates on re-hydration
        await db.query(`CREATE ${tableName}:${recordId} CONTENT ${JSON.stringify(objWithoutId)}`);
        insertedCount++;
      } catch (error) {
        console.warn(`[Hydration] Error inserting object:`, error.message);
        // Continue with next object
      }
    }

    console.log(`[Hydration] Loaded ${insertedCount} ${tableName}`);
  } catch (error) {
    console.error(`[Hydration] Error hydrating ${tableName}:`, error);
    throw error;
  }
}
