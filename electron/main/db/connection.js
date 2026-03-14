// Author: Claude Code
// SurrealDB lifecycle manager — persistent storage at ~/.index/surreal/
// v0.4: DB is the source of truth; no temp dir, no hydration from JSON on startup.

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Surreal from 'surrealdb';
import { migrateFromV3IfNeeded } from './migration.js';

const DB_HOST = '127.0.0.1';
const DB_PORT = 8000;
const DB_USER = 'root';
const DB_PASS = 'root';
const DB_NAMESPACE = 'index';
const DB_DATABASE = 'main';

const INDEX_DIR = path.join(os.homedir(), '.index');
const SURREAL_DIR = path.join(INDEX_DIR, 'surreal');

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

    dbProcess = spawn('surreal', [
      'start',
      '--bind', `${DB_HOST}:${DB_PORT}`,
      '--user', DB_USER,
      '--pass', DB_PASS,
      `file://${SURREAL_DIR}`,
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
  const tables = ['objects', 'tag_definitions', 'tag_assignments', 'spaces'];
  for (const table of tables) {
    try {
      await db.query(`DEFINE TABLE ${table} SCHEMALESS;`);
    } catch (error) {
      if (!error.message?.includes('already exists')) throw error;
    }
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
