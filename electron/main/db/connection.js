// Author: Claude Sonnet 4.6
// SurrealDB lifecycle — persistent storage at ~/.index/surreal/
// Three-table schema: nodes, edge_types, edges (TYPE RELATION)

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Surreal from 'surrealdb';

const DB_HOST = '127.0.0.1';
const DB_PORT = Number(process.env.INDEX_DB_PORT) || 8000;
const DB_USER = 'root';
const DB_PASS = 'root';
const DB_NAMESPACE = 'index';
const DB_DATABASE = 'main';

const INDEX_DIR = process.env.INDEX_HOME_DIR || path.join(os.homedir(), '.index');
const SURREAL_DIR = path.join(INDEX_DIR, 'surreal');

let db = null;
let dbProcess = null;

export const HOME_NODE_ID = 'nodes:⟨~⟩';
export const ROOT_NODE_ID = 'nodes:⟨/⟩';
export const WEB_DEVICE_ID = 'nodes:⟨web⟩';

function ensureDirectories() {
  [INDEX_DIR, SURREAL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function startDatabaseProcess() {
  return new Promise((resolve, reject) => {
    ensureDirectories();

    try {
      execSync(`lsof -ti :${DB_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    } catch { /* no existing process */ }

    console.log('[DB] Starting SurrealDB...');
    const devNull = fs.openSync('/dev/null', 'w');

    // SURREAL_BIN lets an instance pin a specific server binary (e.g. a
    // local 2.x build compatible with this app's SDK) without disturbing
    // the system-wide `surreal`.
    const surrealBin = process.env.SURREAL_BIN || 'surreal';

    dbProcess = spawn(surrealBin, [
      'start',
      '--bind', `${DB_HOST}:${DB_PORT}`,
      '--user', DB_USER,
      '--pass', DB_PASS,
      `rocksdb://${SURREAL_DIR}`,
    ], { stdio: ['ignore', devNull, devNull] });

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
          console.log('[DB] SurrealDB ready');
          resolve();
        }
      } catch {
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
      console.log(`[DB] SurrealDB exited with code ${code}`);
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

async function initializeSchema() {
  // Tables
  await db.query(`DEFINE TABLE IF NOT EXISTS nodes SCHEMALESS;`);
  await db.query(`DEFINE TABLE IF NOT EXISTS edges SCHEMALESS TYPE RELATION;`);
  await db.query(`DEFINE TABLE IF NOT EXISTS edge_types SCHEMALESS;`);

  // Indexes
  await db.query(`DEFINE INDEX IF NOT EXISTS edges_in   ON edges FIELDS in;`);
  await db.query(`DEFINE INDEX IF NOT EXISTS edges_out  ON edges FIELDS out;`);
  await db.query(`DEFINE INDEX IF NOT EXISTS edges_type ON edges FIELDS type;`);

  await seedSystem();
}

async function seedSystem() {
  const now = new Date().toISOString();

  // Home group (~)
  const homeExists = await db.query(`SELECT id FROM nodes:⟨~⟩`);
  if (!homeExists[0]?.length) {
    await db.query(`CREATE nodes:⟨~⟩ CONTENT ${JSON.stringify({
      name: '~', schema: 'group', system: true, created_at: now, updated_at: now,
    })}`);
    console.log('[DB] Seeded home group nodes:⟨~⟩');
  }

  // Root group (/)
  const rootExists = await db.query(`SELECT id FROM nodes:⟨/⟩`);
  if (!rootExists[0]?.length) {
    await db.query(`CREATE nodes:⟨/⟩ CONTENT ${JSON.stringify({
      name: '/', schema: 'group', system: true, created_at: now, updated_at: now,
    })}`);
    console.log('[DB] Seeded root group nodes:⟨/⟩');
  }

  // Web device
  const webExists = await db.query(`SELECT id FROM nodes:⟨web⟩`);
  if (!webExists[0]?.length) {
    await db.query(`CREATE nodes:⟨web⟩ CONTENT ${JSON.stringify({
      name: 'web', schema: 'device', system: true, created_at: now, updated_at: now,
    })}`);
    console.log('[DB] Seeded web device nodes:⟨web⟩');
  }
}

export async function startDatabase() {
  if (db) return db;
  try {
    await startDatabaseProcess();
    db = await connectToDatabase();
    await initializeSchema();
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
    console.log('[DB] Stopping...');
    if (db) {
      try { await db.close(); } catch { /* ignore */ }
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
    console.log('[DB] Stopped');
  } catch (error) {
    console.error('[DB] Error stopping:', error);
    db = null;
    if (dbProcess) { dbProcess.kill('SIGKILL'); dbProcess = null; }
    throw error;
  }
}
