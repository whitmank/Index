#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get arguments from command line or environment variable
// This allows arguments to be passed via npm scripts
let args = process.argv.slice(2);

// If no args from command line, check environment variable
if (args.length === 0 && process.env.ELECTRON_ARGS) {
  try {
    args = JSON.parse(process.env.ELECTRON_ARGS);
  } catch (e) {
    // If parsing fails, treat as space-separated string
    args = process.env.ELECTRON_ARGS.split(/\s+/).filter(Boolean);
  }
}

// Start electron with all forwarded arguments
const electronPath = require('electron');
const electronArgs = [path.join(__dirname, '..'), ...args];

if (args.length > 0) {
  console.log('🚀 Starting Electron with args:', args.join(' '));
}

const electron = spawn(electronPath, electronArgs, {
  stdio: 'inherit',
  shell: false
});

electron.on('close', (code) => {
  process.exit(code);
});

electron.on('error', (err) => {
  console.error('❌ Failed to start Electron:', err);
  process.exit(1);
});
