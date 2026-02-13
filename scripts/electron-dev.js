#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

// Start Vite dev server
console.log('🚀 Starting Vite dev server...');
const vite = spawn('npx', ['vite'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173',
  },
});

// Wait a bit for Vite to start, then start Electron
setTimeout(() => {
  console.log('⚛️  Starting Electron...');
  const electron = spawn('npx', ['electron', '.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
      NODE_ENV: 'development',
    },
  });

  electron.on('close', (code) => {
    vite.kill();
    process.exit(code || 0);
  });
}, 3000);

vite.on('error', (err) => {
  console.error('❌ Vite error:', err);
  process.exit(1);
});
