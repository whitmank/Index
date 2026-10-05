// Author: Claude Code
// SurrealDB lifecycle manager — persistent storage at ~/.index/surreal/
// v0.4: DB is the source of truth; no temp dir, no hydration from JSON on startup.

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Surreal } from 'surrealdb';
import { migrateFromV3IfNeeded } from './migration.js';
import { seedTagTypes } from '../domain/tag-types.js';

const DB_HOST = '127.0.0.1';
const DB_PORT = 8000;
const DB_USER = 'root';
const DB_PASS = 'root';
const DB_NAMESPACE = 'index';
const DB_DATABASE = 'main';

const INDEX_DIR = path.join(os.homedir(), '.index');
const SURREAL_DIR = path.join(INDEX_DIR, 'surreal');

// Project-local SurrealDB binary — pinned to a version compatible with both
// the `surrealdb` JS SDK's supported range and the on-disk RocksDB format
// already written by prior runs, independent of whatever the global
// `surreal` CLI happens to be (which can drift and break compatibility).
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const LOCAL_SURREAL_BIN = path.join(PROJECT_ROOT, '.bin', 'surreal');
const SURREAL_BIN = fs.existsSync(LOCAL_SURREAL_BIN) ? LOCAL_SURREAL_BIN : 'surreal';

let db = null;
let dbProcess = null;

function ensureDirectories() {
  [INDEX_DIR, SURREAL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function startDatabaseProcess() {
  return new Promise((resolve, reject) => {
    ensureDirectories();

    // Kill any existing process on the target port
    try {
      execSync(`lsof -ti :${DB_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    } catch (e) {
      // No existing process — fine
    }

    console.log('[DB] Starting SurrealDB (persistent)...');
    const devNull = fs.openSync('/dev/null', 'w');

    dbProcess = spawn(SURREAL_BIN, [
      'start',
      '--bind', `${DB_HOST}:${DB_PORT}`,
      '--user', DB_USER,
      '--pass', DB_PASS,
      `rocksdb://${SURREAL_DIR}`,
    ], {
      stdio: ['ignore', devNull, devNull],
    });

    let isReady = false;
    let attempts = 0;
    const maxAttempts = 100;

    const checkReady = setInterval(async () => {
      attempts++;
      try {
        const testClient = new Surreal();
        await testClient.connect(`ws://${DB_HOST}:${DB_PORT}`);
        await testClient.close();

        if (!isReady) {
          isReady = true;
          clearInterval(checkReady);
          console.log('[DB] SurrealDB is ready');
          resolve();
        }
      } catch (e) {
        if (attempts >= maxAttempts) {
          clearInterval(checkReady);
          reject(new Error('SurrealDB failed to start within 10 seconds'));
        }
      }
    }, 100);

    dbProcess.on('error', (error) => {
      console.error('[DB] Failed to spawn SurrealDB:', error.message);
      reject(error);
    });

    dbProcess.on('close', (code) => {
      console.log(`[DB] SurrealDB process exited with code ${code}`);
      dbProcess = null;
    });

    setTimeout(() => {
      if (!isReady) reject(new Error('SurrealDB failed to start within 10 seconds'));
    }, 10000);
  });
}

async function connectToDatabase() {
  const client = new Surreal();
  await client.connect(`ws://${DB_HOST}:${DB_PORT}`);
  await client.signin({ username: DB_USER, password: DB_PASS });
  await client.use({ namespace: DB_NAMESPACE, database: DB_DATABASE });
  console.log(`[DB] Connected to ${DB_NAMESPACE}/${DB_DATABASE}`);
  return client;
}

async function initializeTables() {
  // Normal tables
  const tables = ['objects', 'tag_definitions', 'tag_types'];
  for (const table of tables) {
    try {
      await db.query(`DEFINE TABLE ${table} SCHEMALESS;`);
    } catch (error) {
      if (!error.message?.includes('already exists')) throw error;
    }
  }

  // Edge tables (TYPE RELATION)
  const edgeTables = ['tagged', 'contains', 'excludes', 'typed'];
  for (const table of edgeTables) {
    try {
      await db.query(`DEFINE TABLE ${table} SCHEMALESS TYPE RELATION;`);
    } catch (error) {
      if (!error.message?.includes('already exists')) throw error;
    }
  }

  await renameTagTypes();
  await seedSystemContainers();
}

// Fixed IDs for system containers — stable across restarts.
export const ROOT_CONTAINER_ID = 'objects:root';
export const ALL_CONTAINER_ID  = 'objects:all';

// Rename legacy tag type keys to current vocabulary, then migrate type string → typed edges.
async function renameTagTypes() {
  // Step 1: legacy string renames — idempotent, no-op once applied
  await db.query(`UPDATE tag_definitions SET type = 'kind' WHERE type = 'media_type'`);
  await db.query(`UPDATE tag_definitions SET type = 'kind' WHERE type = 'medium'`);
  await db.query(`UPDATE tag_definitions SET type = 'file' WHERE type = 'file_type'`);

  // Step 2: seed tag_types records from domain registry
  await seedTagTypes(db);

  // Step 3: create typed edges for tag_definitions that still carry a type string
  const existing = await db.query(`SELECT id, type FROM tag_definitions WHERE type IS NOT NONE`);
  const tagsWithType = existing[0] || [];
  for (const tag of tagsWithType) {
    const tagId = tag.id?.toString?.() ?? tag.id;
    const typeId = `tag_types:${tag.type}`;
    const edgeExists = await db.query(`SELECT id FROM typed WHERE in = ${tagId} AND out = ${typeId}`);
    if (!edgeExists[0] || edgeExists[0].length === 0) {
      await db.query(`RELATE ${tagId}->typed->${typeId}`);
    }
  }

  // Step 4: remove the now-redundant type field from all tag_definitions
  await db.query(`UPDATE tag_definitions UNSET type`);
}

async function seedSystemContainers() {
  const now = new Date().toISOString();

  // Clean up any old random-ID system containers from earlier schema versions
  await db.query(`DELETE FROM objects WHERE system = true AND name IN ['All', 'ALL'] AND id != objects:all`);
  await db.query(`DELETE FROM objects WHERE system = true AND name = 'root' AND id != objects:root`);

  // objects:root — root view; holds pinned objects via contains edges; never shown as a space
  const rootExists = await db.query(`SELECT id FROM objects:root`);
  if (!rootExists[0] || rootExists[0].length === 0) {
    await db.query(`CREATE objects:root CONTENT ${JSON.stringify({
      name: 'root', container: true, query: null,
      system: true, default_view: 'list',
      created_at: now, updated_at: now,
    })}`);
    console.log('[DB] System root container seeded');
  }

  // objects:all — shows all leaf objects; appears as a navigable space at root
  const allExists = await db.query(`SELECT id FROM objects:all`);
  if (!allExists[0] || allExists[0].length === 0) {
    await db.query(`CREATE objects:all CONTENT ${JSON.stringify({
      name: 'ALL', container: true, query: null,
      system: true, default_view: 'list',
      created_at: now, updated_at: now,
    })}`);
    console.log('[DB] System "All" container seeded');
  }

  // Ensure name is canonical (fixup for records seeded before the ALL capitalisation change)
  await db.query(`UPDATE objects:all SET name = 'ALL' WHERE name != 'ALL'`);

  // Ensure objects:all is pinned to root
  const rootAllEdge = await db.query(`SELECT id FROM contains WHERE in = objects:root AND out = objects:all`);
  if (!rootAllEdge[0] || rootAllEdge[0].length === 0) {
    await db.query(`RELATE objects:root->contains->objects:all SET \`order\` = 0`);
    console.log('[DB] Pinned "All" to root');
  }
}

/**
 * Start the SurrealDB instance.
 * Persistent storage — no hydration step needed after first run.
 */
export async function startDatabase() {
  if (db) return db;

  try {
    await startDatabaseProcess();
    db = await connectToDatabase();
    await initializeTables();

    // One-time migration from v0.3 JSON files if needed
    await migrateFromV3IfNeeded(db);

    console.log('[DB] Database started successfully');
    return db;
  } catch (error) {
    console.error('[DB] Failed to start database:', error);
    db = null;
    if (dbProcess) { dbProcess.kill(); dbProcess = null; }
    throw error;
  }
}

export function getDatabase() {
  return db;
}

export async function stopDatabase() {
  if (!db && !dbProcess) return;

  try {
    console.log('[DB] Stopping database...');

    if (db) {
      try { await db.close(); } catch (e) { console.warn('[DB] Error closing connection:', e.message); }
      db = null;
    }

    if (dbProcess && !dbProcess.killed) {
      await new Promise((resolve) => {
        dbProcess.on('close', resolve);
        dbProcess.kill('SIGTERM');
        setTimeout(() => {
          if (dbProcess && !dbProcess.killed) dbProcess.kill('SIGKILL');
          resolve();
        }, 5000);
      });
      dbProcess = null;
    }

    console.log('[DB] Database stopped');
  } catch (error) {
    console.error('[DB] Error stopping database:', error);
    db = null;
    if (dbProcess) { dbProcess.kill('SIGKILL'); dbProcess = null; }
    throw error;
  }
}

export function isDatabaseRunning() {
  return db !== null && dbProcess !== null;
}
