#!/usr/bin/env node

const { execSync, spawn } = require('child_process');

// Get all arguments after the script name (these are the --db user/0 type args)
const electronArgs = process.argv.slice(2);

// Set environment variable for the electron start script
if (electronArgs.length > 0) {
  process.env.ELECTRON_ARGS = JSON.stringify(electronArgs);
  console.log('📦 Forwarding arguments to Electron:', electronArgs.join(' '));
}

// Use concurrently directly via spawn with proper argument handling
const args = [
  'concurrently',
  '--kill-others',
  '--prefix-colors', 'bgBlue.bold,bgMagenta.bold,bgGreen.bold',
  '--prefix', '[{name}]',
  '--names', 'database,frontend,electron',
  'npm:dev:db',
  'npm:dev:frontend',
  'npm run electron:start'
];

const concurrently = spawn('npx', args, {
  stdio: 'inherit',
  env: process.env
});

concurrently.on('close', (code) => {
  process.exit(code);
});

concurrently.on('error', (err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});
