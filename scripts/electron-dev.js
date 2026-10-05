#!/usr/bin/env node
// Authored by Karter Whitman using Claude Opus 4.8
// Dev launcher. Runs this workspace as a fully isolated Index instance:
//   - INDEX_DATA_DIR is derived from the workspace folder (e.g. ~/.index-0.5),
//     so the database, device id, settings and export never collide with
//     another running instance.
//   - The Vite dev server binds a free port, and Electron is pointed at that
//     exact URL — so it can never accidentally load another instance's UI.

import { spawn } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

// Per-workspace data directory. Overridable via INDEX_DATA_DIR.
const instanceName = path.basename(projectRoot); // e.g. "0.5"
const dataDir = process.env.INDEX_DATA_DIR
  || path.join(os.homedir(), `.index-${instanceName}`);

// Ask the OS for a free TCP port on loopback.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const vitePort = await getFreePort();
const devServerUrl = `http://localhost:${vitePort}`;

console.log(`[dev] Instance: ${instanceName}`);
console.log(`[dev] Data dir: ${dataDir}`);
console.log(`[dev] Vite:     ${devServerUrl}`);

// Start Vite dev server on the chosen free port.
const vite = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    INDEX_DATA_DIR: dataDir,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

// Wait for Vite to start, then start Electron pointed at the same URL.
setTimeout(() => {
  console.log('Starting Electron...');
  const electron = spawn('npx', ['electron', '.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      INDEX_DATA_DIR: dataDir,
      VITE_DEV_SERVER_URL: devServerUrl,
      NODE_ENV: 'development',
    },
  });

  electron.on('close', (code) => {
    vite.kill();
    process.exit(code || 0);
  });
}, 3000);

vite.on('error', (err) => {
  console.error('Vite error:', err);
  process.exit(1);
});
