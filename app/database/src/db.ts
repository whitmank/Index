// Authored by Karter Whitman using Claude Opus 4.8
// The database's lifecycle: spawn SurrealDB as a child process, wait for
// it, connect, install the schema, seed. Deliberately free of Electron —
// the backend calls it at startup, the test script calls it against a
// throwaway directory on another port.
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Surreal } from "surrealdb";
import { seed } from "./seed.js";

const require = createRequire(import.meta.url);

export interface DatabaseOptions {
  /** Where the RocksDB store lives. Default `~/.index/surreal`. */
  directory?: string;
  /** Default 8422 (PRODUCT-SPEC §4). */
  port?: number;
  host?: string;
  namespace?: string;
  database?: string;
}

export interface DatabaseHandle {
  db: Surreal;
  stop: () => Promise<void>;
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 8422,
  namespace: "index",
  database: "main",
  user: "root",
  pass: "root",
} as const;

const READY_INTERVAL_MS = 100;
const READY_TIMEOUT_MS = 10_000;
const SIGKILL_GRACE_MS = 5_000;

export function defaultDirectory(): string {
  return path.join(os.homedir(), ".index", "surreal");
}

function schemaDDL(): string {
  return fs.readFileSync(require.resolve("@index/database/schema.surql"), "utf8");
}

function startProcess(options: Required<Pick<DatabaseOptions, "directory" | "host" | "port">>): ChildProcess {
  fs.mkdirSync(options.directory, { recursive: true });

  // stdout/stderr are inherited so a failure to bind is visible in the
  // dev console rather than swallowed.
  return spawn(
    "surreal",
    [
      "start",
      "--bind",
      `${options.host}:${options.port}`,
      "--user",
      DEFAULTS.user,
      "--pass",
      DEFAULTS.pass,
      `rocksdb://${options.directory}`,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

/**
 * Readiness is polled over plain HTTP rather than by opening a throwaway
 * SDK connection: a websocket connect to a port nothing is listening on
 * yet never settles inside Electron's main process, which turns a 10 s
 * timeout into a hang with no window and no error.
 */
async function waitForReady(host: string, port: number): Promise<void> {
  const health = `http://${host}:${port}/health`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(health, { signal: AbortSignal.timeout(READY_INTERVAL_MS * 5) });
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
  }

  throw new Error(
    `SurrealDB did not become ready at ${health} within ${READY_TIMEOUT_MS} ms: ${String(lastError)}`,
  );
}

/**
 * Start the database and hand back a connected client plus the way to
 * stop it. Every caller owns exactly one handle; the repository reads the
 * live client through `getDb()`.
 */
export async function startDatabase(options: DatabaseOptions = {}): Promise<DatabaseHandle> {
  const directory = options.directory ?? defaultDirectory();
  const host = options.host ?? DEFAULTS.host;
  const port = options.port ?? DEFAULTS.port;
  const url = `ws://${host}:${port}/rpc`;

  const child = startProcess({ directory, host, port });
  const spawnFailed = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) => reject(new Error(`could not spawn surreal: ${error.message}`)));
  });

  await Promise.race([waitForReady(host, port), spawnFailed]);

  const db = new Surreal();
  await db.connect(url, {
    namespace: options.namespace ?? DEFAULTS.namespace,
    database: options.database ?? DEFAULTS.database,
    authentication: { username: DEFAULTS.user, password: DEFAULTS.pass },
  });

  await db.query(schemaDDL()).collect();
  setClient(db);
  await seed();

  return { db, stop: () => stopDatabase(db, child) };
}

async function stopDatabase(db: Surreal, child: ChildProcess): Promise<void> {
  clearClient();
  try {
    await db.close();
  } catch {
    /* already gone */
  }

  if (child.exitCode !== null || child.killed) return;

  await new Promise<void>((resolve) => {
    const kill = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, SIGKILL_GRACE_MS);
    child.once("close", () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

let client: Surreal | null = null;

function setClient(next: Surreal): void {
  client = next;
}

function clearClient(): void {
  client = null;
}

/** The live connection. Throws rather than returning null — every caller
 * runs after `startDatabase`, and a null check at each call site would be
 * noise that hides the real invariant. */
export function getDb(): Surreal {
  if (!client) throw new Error("database not started");
  return client;
}
