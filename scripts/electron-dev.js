#!/usr/bin/env node

/**
 * Electron development script
 * Compiles TypeScript and starts Electron in development mode
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// Compile TypeScript
console.log('[electron-dev] Compiling TypeScript...');
const tsc = spawn('npx', ['tsc', '--project', 'electron/main/tsconfig.json'], {
  cwd: rootDir,
  stdio: 'inherit',
});

tsc.on('exit', (code) => {
  if (code !== 0) {
    console.error('[electron-dev] TypeScript compilation failed');
    process.exit(1);
  }

  console.log('[electron-dev] Starting Electron...');
  const electron = spawn('electron', ['electron/main/dist/index.js'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  electron.on('exit', () => {
    process.exit(0);
  });
});
