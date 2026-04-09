// Author: Claude Code
// Electron main process entry point.
// Startup sequence: device init → SurrealDB → window → LIVE SELECT subscriptions.
// Exports JSON to ~/.index/export/ on quit.

import { app, globalShortcut, BrowserWindow, ipcMain, protocol } from 'electron';
import WindowManagerFactory from './window-manager/index.js';
import { startDatabase, stopDatabase, getDatabase } from './db/connection.js';
import { exportToJson } from './db/export.js';
import { startLiveQueries } from './db/live-queries.js';
import { registerDbHandlers, setMainWindow } from './ipc/db-handlers.js';
import { registerWindowHandlers, setProfileChangeCallback } from './ipc/window-handlers.js';
import { registerFsHandlers, readFolderTree } from './ipc/fs-handlers.js';
import { initializeDeviceId } from './config/device.js';
import { loadWindowSettings } from './config/window-settings.js';
import { ensureDeviceNamed } from './dialogs/device-naming-dialog.js';
import * as deviceHandlers from './ipc/device-handlers.js';
import { handleCaptureShortcut } from './capture/index.js';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let quickWindow = null;
let windowManager;
let dbStarted = false;
let windowConfig;

// Queued import path if open-url fires before the window is ready.
let pendingImportPath = null;

// Register the index:// URL scheme before ready so macOS routes it to this app.
app.setAsDefaultProtocolClient('index');

// Register local-file:// as a privileged scheme before app.ready.
// Used by ObjectSourceView to display local files in iframes from the dev server origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

async function triggerImport(importPath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  try {
    const stat = await fs.stat(importPath);
    const tree = stat.isDirectory()
      ? await readFolderTree(importPath)
      : { name: path.basename(importPath), path: importPath, type: 'file', children: [] };
    mainWindow.webContents.send('main:importFolder', tree);
  } catch (err) {
    console.error('[Import] Failed to read path:', importPath, err.message);
  }
}

// macOS delivers the URL via open-url; must be registered before ready.
app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'import') {
      const importPath = decodeURIComponent(parsed.searchParams.get('path') ?? '');
      if (!importPath) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        triggerImport(importPath);
      } else {
        pendingImportPath = importPath;
      }
    }
  } catch {
    // malformed URL — ignore
  }
});

// Active space registry — updated by each window via app:setActiveSpace
const activeSpaceRegistry = { main: null, overlay: null };

/**
 * Returns the space ID that should receive the next capture.
 * Overlay takes priority when it is visible and has an active space.
 */
function getTargetSpaceId() {
  if (quickWindow && !quickWindow.isDestroyed() && quickWindow.isVisible() && activeSpaceRegistry.overlay) {
    return activeSpaceRegistry.overlay;
  }
  return activeSpaceRegistry.main;
}

const toggleHotkey  = process.platform === 'darwin' ? 'cmd+shift+space' : 'ctrl+shift+space';
const captureHotkey = process.platform === 'darwin' ? 'cmd+i' : 'ctrl+i';

function applyDockVisibility(profile) {
  if (process.platform === 'darwin' && app.dock) {
    if (profile === 'window') {
      app.dock.show();
    } else {
      app.dock.hide();
    }
  }
}

function registerToggleShortcut() {
  globalShortcut.unregister(toggleHotkey);
  globalShortcut.register(toggleHotkey, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function registerCaptureShortcut() {
  globalShortcut.unregister(captureHotkey);
  globalShortcut.register(captureHotkey, () => {
    const db = getDatabase();
    handleCaptureShortcut(db, mainWindow, getTargetSpaceId());
  });
}

function createQuickSpaceWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const prodPath = path.join(__dirname, '../../dist/index.html');
  const preloadPath = path.join(__dirname, '../preload/index.js');

  quickWindow = new BrowserWindow({
    width: 520,
    height: 520,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    ...(process.platform === 'darwin' ? {
      type: 'panel',
      visibleOnAllWorkspaces: true,
    } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const query = `?mode=quick`;
  if (devServerUrl) {
    quickWindow.loadURL(devServerUrl + query);
  } else {
    quickWindow.loadFile(prodPath, { query: { mode: 'quick' } });
  }

  quickWindow.on('closed', () => { quickWindow = null; });
}

function registerQuickSpaceShortcut() {
  globalShortcut.unregister(quickSpaceHotkey);
  globalShortcut.register(quickSpaceHotkey, () => {
    if (!quickWindow || quickWindow.isDestroyed()) {
      createQuickSpaceWindow();
      return;
    }
    if (quickWindow.isVisible()) {
      quickWindow.hide();
    } else {
      quickWindow.show();
      quickWindow.focus();
    }
  });
}

function createWindow(profile) {
  windowManager = new WindowManagerFactory();
  mainWindow = windowManager.createWindow({ ...windowConfig, profile });

  windowManager.setupPlatformBehavior(() => {
    console.log('[Window] Space/desktop changed');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerToggleShortcut();
  registerCaptureShortcut();
}

async function recreateWindow(profile) {
  console.log(`[Window] Recreating window with profile: ${profile}`);

  globalShortcut.unregister(toggleHotkey);
  globalShortcut.unregister(captureHotkey);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  applyDockVisibility(profile);
  createWindow(profile);
  setMainWindow(mainWindow);

  // Re-wire live queries to new window
  const db = getDatabase();
  if (db) {
    await startLiveQueries(db);
  }

  mainWindow.show();
  if (profile === 'window') mainWindow.focus();
}

app.on('ready', async () => {
  try {
    const { profile } = loadWindowSettings();
    applyDockVisibility(profile);

    windowConfig = {
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
      prodPath: path.join(__dirname, '../../dist/index.html'),
    };

    await initializeDeviceId();
    const deviceNamed = await ensureDeviceNamed();
    if (!deviceNamed) {
      console.log('[App] User cancelled device naming, quitting');
      app.quit();
      return;
    }

    await startDatabase();
    dbStarted = true;

    registerDbHandlers();
    registerWindowHandlers();
    registerFsHandlers();
    setProfileChangeCallback(recreateWindow);

    // Serve local files via local-file:// so iframes in the renderer can display them
    // regardless of whether the app is loaded from a dev server or file origin.
    protocol.registerFileProtocol('local-file', (request, callback) => {
      const filePath = decodeURIComponent(request.url.replace('local-file://', ''));
      callback({ path: filePath });
    });

    // Track active space per window for capture targeting
    ipcMain.on('app:setActiveSpace', (event, spaceId) => {
      const sender = event.sender;
      const isOverlay = quickWindow && !quickWindow.isDestroyed() && sender === quickWindow.webContents;
      if (isOverlay) {
        activeSpaceRegistry.overlay = spaceId;
      } else {
        activeSpaceRegistry.main = spaceId;
      }
    });

    createWindow(profile);
    setMainWindow(mainWindow);

    // Wire LIVE SELECT subscriptions
    const db = getDatabase();
    await startLiveQueries(db);

    // Flush any import queued before the window was ready (cold-launch via URL scheme).
    if (pendingImportPath) {
      const p = pendingImportPath;
      pendingImportPath = null;
      triggerImport(p);
    }

    console.log('[App] Application ready');
  } catch (error) {
    console.error('[App] Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (dbStarted) {
    event.preventDefault();
    try {
      // Export data to JSON before quitting
      const db = getDatabase();
      if (db) await exportToJson(db);

      await stopDatabase();
      dbStarted = false;

      if (windowManager) windowManager.cleanup();
      app.quit();
    } catch (error) {
      console.error('Error during quit:', error);
      dbStarted = false;
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    const { profile } = loadWindowSettings();
    createWindow(profile);
    setMainWindow(mainWindow);
  }
});
