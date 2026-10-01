// Authored by Karter Whitman using Claude Sonnet 5
// REPL driver for Index 0.6 (Electron). Launches the isolated dev instance
// (vite + electron, ~/.index-0.6 data dir) and exposes commands for an
// agent to poke the UI and capture screenshots.
//
// Usage:
//   node .claude/skills/run-desktop/driver.mjs
//   driver> launch
//   driver> tour
//   driver> quit
//
// Or pipe commands: printf 'launch\ntour\nquit\n' | node .claude/skills/run-desktop/driver.mjs

import { _electron as electron } from 'playwright-core';
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/index-0.6-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const HOME = os.homedir();
const ENV = {
  ...process.env,
  INDEX_HOME_DIR: process.env.INDEX_HOME_DIR || `${HOME}/.index-0.6`,
  INDEX_USER_DATA: process.env.INDEX_USER_DATA || `${HOME}/Library/Application Support/Index-0.6`,
  INDEX_DB_PORT: process.env.INDEX_DB_PORT || '8000',
  INDEX_VITE_PORT: process.env.INDEX_VITE_PORT || '5173',
  SURREAL_BIN: process.env.SURREAL_BIN || `${HOME}/.index-0.6/bin/surreal`,
};
const VITE_URL = `http://localhost:${ENV.INDEX_VITE_PORT}`;

// Refuse to collide with the 0.7 instance's ports, same guard as launch-independent.sh.
if (ENV.INDEX_DB_PORT === '8422' || ENV.INDEX_VITE_PORT === '5273') {
  console.error('[driver] refusing to use a port owned by the 0.7 instance (8422 / 5273).');
  process.exit(1);
}

const electronBin = process.platform === 'darwin'
  ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(APP_DIR, 'node_modules/electron/dist/electron');

let vite = null;
let app = null;
let page = null;

async function waitForPort(port, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fetch(`http://localhost:${port}`)) return true; }
    catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`port ${port} never came up`);
}

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    console.log('starting vite on port', ENV.INDEX_VITE_PORT, '...');
    vite = spawn('npx', ['vite'], { cwd: APP_DIR, env: ENV, stdio: 'inherit' });
    await waitForPort(ENV.INDEX_VITE_PORT);

    console.log('launching electron (isolated 0.6 instance)...');
    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      env: { ...ENV, VITE_DEV_SERVER_URL: VITE_URL, NODE_ENV: 'development' },
      timeout: 30_000,
    });

    page = app.windows().find(w => !w.url().startsWith('devtools://'))
        ?? await app.firstWindow();

    // Default window profile is 'overlay': hidden until a global hotkey toggles
    // it. A driven launch never fires that hotkey, so force every window visible.
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) { w.show(); w.focus(); }
    });

    await page.waitForSelector('.address-bar', { timeout: 20_000 });
    await new Promise(r => setTimeout(r, 1500)); // let live queries settle
    console.log('launched.', app.windows().length, 'windows:');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  // The app restores its last screen from localStorage (per isolated userData
  // dir), so a fresh launch can land on Settings or wherever a prior run left
  // off. `home` forces a known starting point: list view at root (/).
  async home() {
    if (!page) return console.log('ERROR: launch first');
    await page.keyboard.press('Escape'); // leave settings, if that's where we resumed
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('Meta+/'); // navigate to root
    await new Promise(r => setTimeout(r, 400));
    console.log('at root list view.');
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // DOM click, not locator.click() — this app's window profiles are
  // frameless/transparent, and DOM click sidesteps any coordinate mismatch.
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  // The "New…" create menu (Object/Group) only closes on an outside
  // mousedown — Escape does NOT close it (AddressBar.jsx listens for
  // 'mousedown', not 'keydown'). Use this instead of `press Escape`.
  async 'close-menu'() {
    if (!page) return console.log('ERROR: launch first');
    await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    console.log('dispatched outside mousedown.');
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
    const wcs = await app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() })));
    console.log('webContents:');
    for (const w of wcs) console.log(` [${w.id}] ${w.type}: ${w.url}`);
  },

  // Full walkthrough of every top-level UI surface. Screenshots land in
  // SHOT_DIR (override with SCREENSHOT_DIR env var before launching the driver).
  async tour() {
    if (!page) return console.log('ERROR: launch first');
    await COMMANDS.home();

    await COMMANDS.ss('01-list-view-home');

    await COMMANDS.click('.view-toggle-btn');
    await new Promise(r => setTimeout(r, 800));
    await COMMANDS.ss('02-graph-view');
    await COMMANDS.click('.view-toggle-btn'); // back to list
    await new Promise(r => setTimeout(r, 400));

    // Clicking the label only focuses the input — Tab is what reveals the dropdown.
    await COMMANDS.click('.address-bar-label');
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 300));
    await COMMANDS.ss('03-address-bar-search');
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));

    await COMMANDS.click('.address-bar-create-btn');
    await new Promise(r => setTimeout(r, 400));
    await COMMANDS.ss('04-create-menu');
    await COMMANDS['close-menu']();
    await new Promise(r => setTimeout(r, 300));

    // Pick a non-group row so Enter opens the detail card, not a folder.
    const rowCount = await page.evaluate(() => document.querySelectorAll('.node-row').length);
    if (rowCount > 0) {
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.node-row')];
        (rows.find(r => !r.classList.contains('is-group')) ?? rows[0])?.click();
      });
      await new Promise(r => setTimeout(r, 400));
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 600));
      await COMMANDS.ss('05-node-detail');
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 300));
    } else {
      console.log('no nodes present — skipping node-detail screenshot');
    }

    await page.keyboard.press('Meta+,');
    await new Promise(r => setTimeout(r, 500));
    for (const [label, name] of [
      ['Devices', '06-settings-devices'],
      ['Edge Types', '07-settings-edge-types'],
      ['Appearance', '08-settings-appearance'],
      ['Keybinds', '09-settings-keybinds'],
    ]) {
      await page.evaluate((label) => {
        const btn = [...document.querySelectorAll('.settings-view-tab')].find(b => b.textContent.trim() === label);
        btn?.click();
      }, label);
      await new Promise(r => setTimeout(r, 400));
      await COMMANDS.ss(name);
    }
    console.log('tour complete. screenshots in', SHOT_DIR);
  },

  async quit() {
    if (app) await app.close().catch(() => {});
    if (vite) vite.kill();
    app = null; page = null; vite = null;
  },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

// readline emits 'line' synchronously for every buffered line (e.g. an
// entire piped-in script arrives in one chunk) — an async listener alone
// would let 'tour' start before 'launch' finishes awaiting. Chain each
// command onto a queue so they run strictly one at a time.
let queue = Promise.resolve();
rl.on('line', line => {
  queue = queue.then(async () => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (!cmd) return rl.prompt();
    const fn = COMMANDS[cmd];
    if (!fn) { console.log('unknown:', cmd, '— try: help'); return rl.prompt(); }
    try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
    if (cmd === 'quit') { rl.close(); process.exit(0); }
    rl.prompt();
  });
});
// On a piped-in script, stdin hits EOF (and 'close' fires) as soon as all
// lines have been read into the queue above — not once they've finished
// running. Wait for the queue to actually drain before quitting, otherwise
// a piped 'launch\ntour\nquit\n' would exit mid-launch.
rl.on('close', async () => {
  await queue.catch(() => {});
  if (app || vite) await COMMANDS.quit();
  process.exit(0);
});

console.log('Index 0.6 driver — "help" for commands, "launch" to start, "tour" for a full screenshot walkthrough');
rl.prompt();
