#!/usr/bin/env node
// Author: Claude Code

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

const VITE_PORT = Number(process.env.INDEX_VITE_PORT) || 5173;
const DEV_SERVER_URL = `http://localhost:${VITE_PORT}`;

// Start Vite dev server
console.log('Starting Vite dev server...');
const vite = spawn('npx', ['vite'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: DEV_SERVER_URL,
  },
});

// Wait for Vite to start, then start Electron
setTimeout(() => {
  console.log('Starting Electron...');
  const electron = spawn('npx', ['electron', '.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: DEV_SERVER_URL,
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
