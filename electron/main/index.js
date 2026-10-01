// Author: Claude Sonnet 4.6
// Electron main process entry point.
// Startup: device init → SurrealDB → window → LIVE SELECT subscriptions.

import { app, globalShortcut, BrowserWindow, ipcMain, protocol } from 'electron';
import WindowManagerFactory from './window-manager/index.js';
import { startDatabase, stopDatabase, getDatabase } from './db/connection.js';
import { startLiveQueries } from './db/live-queries.js';
import { registerDbHandlers, setMainWindow } from './ipc/db-handlers.js';
import { registerWindowHandlers, setProfileChangeCallback } from './ipc/window-handlers.js';
import { registerFsHandlers } from './ipc/fs-handlers.js';
import { initializeDeviceId } from './config/device.js';
import { loadWindowSettings } from './config/window-settings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Isolate this instance's Electron state (window/session/cache) when running
// alongside another version. Must be set before the app is ready.
if (process.env.INDEX_USER_DATA) {
  app.setPath('userData', process.env.INDEX_USER_DATA);
}

let mainWindow;
let windowManager;
let dbStarted = false;
let windowConfig;

const toggleHotkey = process.platform === 'darwin' ? 'cmd+shift+space' : 'ctrl+shift+space';

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

function createWindow(profile) {
  windowManager = new WindowManagerFactory();
  mainWindow = windowManager.createWindow({ ...windowConfig, profile });

  windowManager.setupPlatformBehavior(() => {});

  mainWindow.on('closed', () => { mainWindow = null; });

  registerToggleShortcut();
}

async function recreateWindow(profile) {
  globalShortcut.unregister(toggleHotkey);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  applyDockVisibility(profile);
  createWindow(profile);
  setMainWindow(mainWindow);

  const database = getDatabase();
  if (database) await startLiveQueries(database);

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
    await startDatabase();
    dbStarted = true;

    registerDbHandlers();
    registerWindowHandlers();
    registerFsHandlers();
    setProfileChangeCallback(recreateWindow);

    protocol.registerFileProtocol('local-file', (request, callback) => {
      const filePath = decodeURIComponent(request.url.replace('local-file://', ''));
      callback({ path: filePath });
    });

    ipcMain.on('app:setActiveNode', (_event, nodeId) => {
      // Reserved for future main-process use (e.g. menu state)
    });

    createWindow(profile);
    setMainWindow(mainWindow);

    const database = getDatabase();
    await startLiveQueries(database);

    console.log('[App] Ready');
  } catch (error) {
    console.error('[App] Failed to initialize:', error);
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
      await stopDatabase();
      dbStarted = false;
      if (windowManager) windowManager.cleanup();
      app.quit();
    } catch (error) {
      console.error('[App] Error during quit:', error);
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
