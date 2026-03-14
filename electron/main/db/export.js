// Author: Claude Code
// Async JSON export — non-blocking replacement for v0.3 persistToIndex().
// Writes human-readable JSON to ~/.index/export/ on a debounced timer,
// on app quit, and on demand.

import fs from 'fs';
import path from 'path';
import os from 'os';

const INDEX_DIR = path.join(os.homedir(), '.index');
const EXPORT_DIR = path.join(INDEX_DIR, 'export');
const EXPORT_DEBOUNCE_MS = 5000;

let exportTimer = null;

/**
 * Schedule a debounced export. Call this from mutation handlers.
 * @param {Surreal} db
 */
export function scheduleExport(db) {
  clearTimeout(exportTimer);
  exportTimer = setTimeout(() => exportToJson(db), EXPORT_DEBOUNCE_MS);
}

/**
 * Immediately export all data to ~/.index/export/.
 * Safe to call on quit (awaitable, no timer).
 * @param {Surreal} db
 */
export async function exportToJson(db) {
  if (!db) {
    console.warn('[Export] No database connection');
    return;
  }

  try {
    ensureExportStructure();

    await Promise.all([
      exportTable(db, 'objects', path.join(EXPORT_DIR, 'objects')),
      exportTable(db, 'tag_definitions', path.join(EXPORT_DIR, 'tag_definitions')),
      exportTable(db, 'spaces', path.join(EXPORT_DIR, 'spaces')),
      exportTableToSingleFile(db, 'tag_assignments', path.join(EXPORT_DIR, 'tag_assignments.json')),
    ]);

    console.log('[Export] Export complete');
  } catch (error) {
    console.error('[Export] Failed to export data:', error);
  }
}

function ensureExportStructure() {
  [
    EXPORT_DIR,
    path.join(EXPORT_DIR, 'objects'),
    path.join(EXPORT_DIR, 'tag_definitions'),
    path.join(EXPORT_DIR, 'spaces'),
  ].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

async function exportTable(db, tableName, targetDir) {
  const result = await db.query(`SELECT * FROM ${tableName}`);
  const records = (Array.isArray(result) && result.length > 0) ? result[0] : [];

  // Clear old files
  if (fs.existsSync(targetDir)) {
    fs.readdirSync(targetDir)
      .filter(f => f.endsWith('.json'))
      .forEach(f => fs.unlinkSync(path.join(targetDir, f)));
  }

  records.forEach(record => {
    try {
      const recordId = record.id?.id ?? Date.now().toString();
      const sanitizedName = (record.name || 'record')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      const filename = `${sanitizedName}_${recordId}.json`;
      fs.writeFileSync(path.join(targetDir, filename), JSON.stringify(record, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Export] Error writing record file:', e);
    }
  });
}

async function exportTableToSingleFile(db, tableName, filePath) {
  const result = await db.query(`SELECT * FROM ${tableName}`);
  const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
