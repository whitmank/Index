import { app, globalShortcut } from 'electron';
import WindowManagerFactory from './window-manager/index.js';
import { startDatabase, stopDatabase, getDatabase } from './db/index.js';
import { registerDbHandlers, setMainWindow, broadcastObjectsChanged } from './ipc/db-handlers.js';
import { registerWindowHandlers, setProfileChangeCallback } from './ipc/window-handlers.js';
import { startObjectsWatcher, stopObjectsWatcher } from './watchers/objects.js';
import { initializeDeviceId } from './config/device.js';
import { loadWindowSettings } from './config/window-settings.js';
import { ensureDeviceNamed } from './windows/device-naming-dialog.js';
import * as deviceHandlers from './ipc/device-handlers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let windowManager;
let dbStarted = false;
let windowConfig; // saved so we can recreate the window with the same base config

const toggleHotkey = process.platform === 'darwin' ? 'cmd+`' : 'ctrl+`';

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

  windowManager.setupPlatformBehavior(() => {
    console.log('[Window] Space/desktop changed');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerToggleShortcut();
}

async function recreateWindow(profile) {
  console.log(`[Window] Recreating window with profile: ${profile}`);

  // Unregister shortcut before destroying window
  globalShortcut.unregister(toggleHotkey);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  applyDockVisibility(profile);
  createWindow(profile);
  setMainWindow(mainWindow);

  // Show the window immediately after a profile switch so the user sees the result
  mainWindow.show();
  if (profile === 'window') {
    mainWindow.focus();
  }
}

app.on('ready', async () => {
  try {
    // Load window profile before creating window
    const { profile } = loadWindowSettings();
    applyDockVisibility(profile);

    // Store base config for later recreation
    windowConfig = {
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
      prodPath: path.join(__dirname, '../../dist/index.html'),
    };

    const device = await initializeDeviceId();
    const deviceNamed = await ensureDeviceNamed();
    if (!deviceNamed) {
      console.log('[App] User cancelled device naming, quitting');
      app.quit();
      return;
    }

    await startDatabase();
    dbStarted = true;

    // Register IPC handlers
    registerDbHandlers();
    registerWindowHandlers();
    setProfileChangeCallback(recreateWindow);

    createWindow(profile);

    setMainWindow(mainWindow);

    // Start file watcher for live updates
    const db = getDatabase();
    startObjectsWatcher(db, (objects) => {
      broadcastObjectsChanged(objects);
    });

    console.log('[App] Application ready');
  } catch (error) {
    console.error('[App] Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (dbStarted) {
    event.preventDefault();
    try {
      stopObjectsWatcher();
      await stopDatabase();
      dbStarted = false;
      if (windowManager) {
        windowManager.cleanup();
      }
      app.quit();
    } catch (error) {
      console.error('Error stopping database:', error);
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    const { profile } = loadWindowSettings();
    createWindow(profile);
  }
});
