import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Surreal from 'surrealdb';
import { hydrateFromIndex } from './hydration.js';
import { repairMissingSystemTagsForAllObjects } from './repair.js';

// Author: Claude Code
// SurrealDB lifecycle manager - spawns binary, initializes, and manages the database instance
// Uses ephemeral storage: temporary directory that's cleaned up on shutdown

const DB_HOST = '127.0.0.1';
const DB_PORT = 8000;
const DB_USER = 'root';
const DB_PASS = 'root';
const DB_NAMESPACE = 'index';
const DB_DATABASE = 'main';

let db = null;
let dbProcess = null;
let tempDbDir = null;

/**
 * Ensure data directory exists
 */
function ensureDataDirectory() {
  const dataDir = path.join(os.homedir(), '.index');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[DB] Created data directory:', dataDir);
  }
  return dataDir;
}

/**
 * Start SurrealDB binary process
 * @private
 * @returns {Promise<void>}
 */
function startDatabaseProcess() {
  return new Promise((resolve, reject) => {
    ensureDataDirectory();

    // Kill any existing SurrealDB process on the target port to ensure fresh start
    try {
      execSync(`lsof -ti :${DB_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
      // Give it a moment to fully close
      setTimeout(() => {}, 200);
    } catch (e) {
      // If no process exists or kill fails, that's fine
    }

    // Create temporary directory for ephemeral storage
    // This ensures fresh state on each startup
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-db-'));
    const dbPath = path.join(tempDbDir, 'db.surdb');

    console.log('[DB] Starting SurrealDB process (ephemeral - temp dir)...');
    console.log('[DB] Temporary storage:', tempDbDir);

    // Spawn SurrealDB with temporary directory
    // Fresh state on each startup, cleaned up on shutdown
    // Suppress verbose startup logs
    const devNull = fs.openSync('/dev/null', 'w');

    dbProcess = spawn('surreal', [
      'start',
      '--bind',
      `${DB_HOST}:${DB_PORT}`,
      '--user',
      DB_USER,
      '--pass',
      DB_PASS,
      `file://${dbPath}`,
    ], {
      stdio: ['ignore', devNull, devNull], // Suppress stdout/stderr
    });

    let isReady = false;

    // Poll for readiness by trying to connect
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
        // Not ready yet, keep trying
      }
    }, 100);

    // Handle process errors
    dbProcess.on('error', (error) => {
      console.error('[DB] Failed to spawn SurrealDB:', error.message);
      reject(error);
    });

    // Handle process exit
    dbProcess.on('close', (code) => {
      console.log(`[DB] SurrealDB process exited with code ${code}`);
      dbProcess = null;
    });

    // Timeout if DB doesn't start
    setTimeout(() => {
      if (!isReady && dbProcess && !dbProcess.killed) {
        reject(new Error('SurrealDB failed to start within 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Connect to running SurrealDB instance
 * @private
 * @returns {Promise<Surreal>}
 */
async function connectToDatabase() {
  console.log('[DB] Connecting to SurrealDB...');

  const client = new Surreal();
  await client.connect(`ws://${DB_HOST}:${DB_PORT}`);

  // Sign in with correct parameter names
  await client.signin({
    username: DB_USER,
    password: DB_PASS,
  });

  // Use namespace and database
  await client.use({
    namespace: DB_NAMESPACE,
    database: DB_DATABASE,
  });

  console.log(`[DB] Connected to ${DB_NAMESPACE}/${DB_DATABASE}`);
  return client;
}

/**
 * Initialize database tables
 * @private
 */
async function initializeTables() {
  console.log('[DB] Initializing tables...');

  const tables = ['objects', 'tag_definitions', 'tag_assignments', 'collections'];

  for (const table of tables) {
    try {
      await db.query(`DEFINE TABLE ${table} SCHEMALESS;`);
      console.log(`[DB] Table '${table}' ready`);
    } catch (error) {
      // Table might already exist, that's fine
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }
}

/**
 * Start SurrealDB instance
 * @returns {Promise<Surreal>} Database connection
 */
export async function startDatabase() {
  if (db) {
    console.log('[DB] Database already running');
    return db;
  }

  try {
    // Start the process
    await startDatabaseProcess();

    // Connect to it
    db = await connectToDatabase();

    // Initialize tables
    await initializeTables();

    // Hydrate from local .index/ files
    await hydrateFromIndex(db);

    // Repair missing system tags for all objects
    await repairMissingSystemTagsForAllObjects(db);

    console.log('[DB] Database started successfully');
    return db;
  } catch (error) {
    console.error('[DB] Failed to start database:', error);
    db = null;
    if (dbProcess) {
      dbProcess.kill();
      dbProcess = null;
    }
    throw error;
  }
}

/**
 * Get database connection
 * @returns {Surreal|null}
 */
export function getDatabase() {
  return db;
}

/**
 * Stop database instance
 * @returns {Promise<void>}
 */
export async function stopDatabase() {
  if (!db && !dbProcess) {
    console.log('[DB] Database not running');
    return;
  }

  try {
    console.log('[DB] Stopping database...');

    // Close client connection
    if (db) {
      try {
        await db.close();
      } catch (error) {
        console.warn('[DB] Error closing connection:', error.message);
      }
      db = null;
    }

    // Terminate process gracefully
    if (dbProcess && !dbProcess.killed) {
      await new Promise((resolve) => {
        dbProcess.on('close', resolve);
        dbProcess.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (dbProcess && !dbProcess.killed) {
            console.log('[DB] Force killing SurrealDB process');
            dbProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
      dbProcess = null;
    }

    // Clean up temporary directory
    if (tempDbDir && fs.existsSync(tempDbDir)) {
      try {
        fs.rmSync(tempDbDir, { recursive: true, force: true });
        console.log('[DB] Cleaned up temporary database directory');
      } catch (error) {
        console.warn('[DB] Error cleaning up temp directory:', error.message);
      }
      tempDbDir = null;
    }

    console.log('[DB] Database stopped');
  } catch (error) {
    console.error('[DB] Error stopping database:', error);
    db = null;
    if (dbProcess) {
      dbProcess.kill('SIGKILL');
      dbProcess = null;
    }
    throw error;
  }
}

/**
 * Check if database is running
 * @returns {boolean}
 */
export function isDatabaseRunning() {
  return db !== null && dbProcess !== null;
}
