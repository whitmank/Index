// Author: Claude Code
// Electron main process — v0.4.
// Changes from v0.3:
//   - File watcher removed (LIVE SELECT drives reactivity)
//   - exportToJson() called on before-quit (not persistToIndex)
//   - startLiveQueries() wires LIVE SELECT after DB + window ready

import { app, globalShortcut } from 'electron';
import WindowManagerFactory from './window-manager/index.js';
import { startDatabase, stopDatabase, getDatabase } from './db/index.js';
import { exportToJson } from './db/export.js';
import { startLiveQueries } from './db/live-queries.js';
import { registerDbHandlers, setMainWindow } from './ipc/db-handlers.js';
import { registerWindowHandlers, setProfileChangeCallback } from './ipc/window-handlers.js';
import { initializeDeviceId } from './config/device.js';
import { loadWindowSettings } from './config/window-settings.js';
import { ensureDeviceNamed } from './windows/device-naming-dialog.js';
import * as deviceHandlers from './ipc/device-handlers.js';
import { handleCaptureShortcut } from './capture/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let windowManager;
let dbStarted = false;
let windowConfig;

const toggleHotkey = process.platform === 'darwin' ? 'cmd+`' : 'ctrl+`';
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
    handleCaptureShortcut(db, mainWindow);
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
    await startLiveQueries(db, mainWindow);
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
    setProfileChangeCallback(recreateWindow);

    createWindow(profile);
    setMainWindow(mainWindow);

    // Wire LIVE SELECT subscriptions
    const db = getDatabase();
    await startLiveQueries(db, mainWindow);

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
