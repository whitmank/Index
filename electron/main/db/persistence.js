import fs from 'fs';
import path from 'path';
import os from 'os';

// Author: Claude Code
// Persistence service - exports SurrealDB objects to individual .index/ JSON files

const INDEX_DIR = path.join(os.homedir(), '.index');

/**
 * Ensure .index/ directory structure exists
 * @private
 */
function ensureIndexStructure() {
  const dirs = [
    path.join(INDEX_DIR, 'objects'),
    path.join(INDEX_DIR, 'relationships'),
    path.join(INDEX_DIR, 'tags'),
    // object_tags is stored as single file, no directory needed
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Write object to individual JSON file
 * @private
 */
function writeObjectFile(dir, obj) {
  try {
    // Extract ID string from RecordId object
    const recordId = (obj.id && obj.id.id) || Date.now().toString();

    // Sanitize name for filename (remove special chars, lowercase, limit length)
    const sanitizedName = (obj.name || 'object')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    // Combine name + ID for human-readable but unique filename
    const filename = `${sanitizedName}_${recordId}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
    return filePath;
  } catch (error) {
    console.error(`[Persistence] Error writing object file:`, error);
    throw error;
  }
}

/**
 * Persist objects from a table to individual files
 * @private
 */
async function persistTable(db, tableName, targetDir) {
  try {
    const result = await db.query(`SELECT * FROM ${tableName}`);
    const objects = (Array.isArray(result) && result.length > 0) ? result[0] : [];

    // Clear directory (remove old files)
    if (fs.existsSync(targetDir)) {
      fs.readdirSync(targetDir).forEach((file) => {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(targetDir, file));
        }
      });
    }

    // Write each object to its own file
    objects.forEach((obj) => {
      writeObjectFile(targetDir, obj);
    });

    console.log(`[Persistence] Persisted ${objects.length} ${tableName}`);
    return objects.length;
  } catch (error) {
    console.error(`[Persistence] Error persisting ${tableName}:`, error);
    throw error;
  }
}

/**
 * Persist a table to a single bundled JSON file
 * Used for join tables (object_tags) where granular files aren't necessary
 * @private
 */
async function persistTableToSingleFile(db, tableName, filePath) {
  try {
    const result = await db.query(`SELECT * FROM ${tableName}`);
    const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];

    // Write all records to a single file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`[Persistence] Persisted ${data.length} ${tableName} to single file`);
    return data.length;
  } catch (error) {
    console.error(`[Persistence] Error persisting ${tableName} to file:`, error);
    throw error;
  }
}

/**
 * Persist all data from SurrealDB to .index/ individual files
 * @param {Surreal} db - Database connection
 * @returns {Promise<void>}
 */
export async function persistToIndex(db) {
  if (!db) {
    console.warn('[Persistence] No database connection available');
    return;
  }

  try {
    ensureIndexStructure();

    console.log('[Persistence] Persisting data to individual files...');

    // Persist each table
    await Promise.all([
      persistTable(db, 'objects', path.join(INDEX_DIR, 'objects')),
      persistTable(db, 'relationships', path.join(INDEX_DIR, 'relationships')),
      persistTable(db, 'tags', path.join(INDEX_DIR, 'tags')),
      persistTableToSingleFile(db, 'object_tags', path.join(INDEX_DIR, 'object_tags.json')),
    ]);

    console.log('[Persistence] All data persisted to .index/');
  } catch (error) {
    console.error('[Persistence] Failed to persist data:', error);
    throw error;
  }
}

/**
 * Get the index directory path
 * @returns {string}
 */
export function getIndexPath() {
  return INDEX_DIR;
}
