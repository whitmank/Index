import { app, globalShortcut } from 'electron';
import WindowManagerFactory from './window-manager/index.js';
import { startDatabase, stopDatabase, getDatabase } from './db/index.js';
import { registerDbHandlers, setMainWindow, broadcastObjectsChanged } from './ipc/db-handlers.js';
import { startObjectsWatcher, stopObjectsWatcher } from './watchers/objects.js';
import { initializeDeviceId } from './config/device.js';
import { ensureDeviceNamed } from './windows/device-naming-dialog.js';
import * as deviceHandlers from './ipc/device-handlers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let windowManager;
let dbStarted = false;

function createWindow() {
  // Get platform-specific window manager
  windowManager = new WindowManagerFactory();

  // Create window with platform-specific settings
  mainWindow = windowManager.createWindow({
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
    prodPath: path.join(__dirname, '../../dist/index.html'),
  });

  // Setup platform-specific behaviors (e.g., space-change detection on macOS)
  windowManager.setupPlatformBehavior(() => {
    console.log('[Window] Space/desktop changed, window was hidden');
  });

  // Toggle window visibility on Cmd+` (or Ctrl+`)
  const toggleHotkey = process.platform === 'darwin' ? 'cmd+`' : 'ctrl+`';
  globalShortcut.register(toggleHotkey, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    globalShortcut.unregister(toggleHotkey);
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    // Hide from macOS dock
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide();
    }

    // Step 1: Initialize device (load or create ID)
    console.log('[App] Initializing device...');
    const device = await initializeDeviceId();
    console.log(`[App] Device ID loaded: ${device.id}`);

    // Step 2: Ensure device is named (shows dialog if needed)
    console.log('[App] Checking device name...');
    const deviceNamed = await ensureDeviceNamed();
    if (!deviceNamed) {
      // User cancelled naming dialog, quit app
      console.log('[App] User cancelled device naming, quitting');
      app.quit();
      return;
    }

    // Step 3: Start database
    console.log('[App] Starting database...');
    await startDatabase();
    dbStarted = true;

    // Register IPC handlers (including device handlers)
    registerDbHandlers();

    // Create window
    console.log('[App] Creating main window...');
    createWindow();

    // Set window for IPC broadcasting
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
  // On macOS, apps stay active until user quits explicitly
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
      // Cleanup platform-specific window resources
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
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});
