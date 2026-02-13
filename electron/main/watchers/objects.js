import fs from 'fs';
import path from 'path';
import os from 'os';
import { watch } from 'fs';
import { BrowserWindow } from 'electron';

// Author: Claude Code
// File watcher for objects directory - detects external modifications and syncs with database

const INDEX_DIR = path.join(os.homedir(), '.index');
const OBJECTS_DIR = path.join(INDEX_DIR, 'objects');

let watcher = null;
let debounceTimer = null;
const DEBOUNCE_MS = 500; // Wait 500ms before reloading to batch rapid changes

/**
 * Start watching objects directory for changes
 * @param {Surreal} db - Database connection
 * @param {Function} onObjectsChanged - Callback when objects change
 * @returns {void}
 */
export function startObjectsWatcher(db, onObjectsChanged) {
  if (watcher) {
    console.log('[Watcher] Objects watcher already running');
    return;
  }

  // Ensure directory exists
  if (!fs.existsSync(OBJECTS_DIR)) {
    console.log('[Watcher] Objects directory does not exist yet');
    return;
  }

  console.log('[Watcher] Starting objects file watcher...');

  watcher = watch(OBJECTS_DIR, async (eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) {
      return; // Ignore non-JSON files
    }

    console.log(`[Watcher] Detected ${eventType} on ${filename}`);

    // Debounce rapid changes
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await reloadObjectsFromDisk(db, onObjectsChanged);
      } catch (error) {
        console.error('[Watcher] Error reloading objects:', error);
      }
    }, DEBOUNCE_MS);
  });

  watcher.on('error', (error) => {
    console.error('[Watcher] File watcher error:', error);
  });
}

/**
 * Stop watching objects directory
 * @returns {void}
 */
export function stopObjectsWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('[Watcher] Objects watcher stopped');
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
}

/**
 * Reload objects from disk into database
 * @private
 */
async function reloadObjectsFromDisk(db, onObjectsChanged) {
  try {
    console.log('[Watcher] Reloading objects from disk...');

    // Delete all existing objects
    await db.query('DELETE FROM objects');

    // Read all JSON files
    const files = fs.readdirSync(OBJECTS_DIR).filter((f) => f.endsWith('.json'));

    if (files.length === 0) {
      console.log('[Watcher] No object files found');
      onObjectsChanged([]);
      return;
    }

    // Load each file and insert into database
    const loadedObjects = [];
    for (const file of files) {
      try {
        const filePath = path.join(OBJECTS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const obj = JSON.parse(content);

        // Extract ID from filename
        const fileNameWithoutExt = file.slice(0, -5);
        const lastUnderscoreIdx = fileNameWithoutExt.lastIndexOf('_');
        const recordId = fileNameWithoutExt.slice(lastUnderscoreIdx + 1);

        // Remove id field and insert
        const { id, ...objWithoutId } = obj;
        await db.query(`CREATE objects:${recordId} CONTENT ${JSON.stringify(objWithoutId)}`);

        loadedObjects.push(obj);
      } catch (error) {
        console.warn(`[Watcher] Error loading ${file}:`, error.message);
      }
    }

    console.log(`[Watcher] Reloaded ${loadedObjects.length} objects`);

    // Notify callback of changes
    onObjectsChanged(loadedObjects);
  } catch (error) {
    console.error('[Watcher] Error reloading objects from disk:', error);
    throw error;
  }
}
