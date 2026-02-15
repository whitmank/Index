import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startDatabase, stopDatabase, getDatabase } from './db/index.js';
import { registerDbHandlers, setMainWindow, broadcastObjectsChanged } from './ipc/db-handlers.js';
import { startObjectsWatcher, stopObjectsWatcher } from './watchers/objects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let dbStarted = false;

function createWindow() {
  // Get the primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Overlay dimensions and positioning
  const overlayWidth = 800;
  const overlayHeight = 600;
  const x = Math.round((screenWidth - overlayWidth) / 2);
  const y = Math.round(screenHeight * 0.15); // Position 15% from top

  mainWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x,
    y,
    frame: false, // Remove window frame/titlebar
    skipTaskbar: true, // Don't show in taskbar
    transparent: true, // Enable transparency
    hasShadow: true, // Add native shadow for depth
    vibrancy: 'popover', // macOS native blur effect
    visualEffectState: 'active', // Keep blur effect active
    resizable: true, // Allow window resizing
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      enableFocusRing: false,
    },
  });

  // Load from Vite dev server in development
  const isDev = process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Load from built files in production
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Hide window by default
  mainWindow.hide();

  // Toggle window visibility on Cmd+` (or Ctrl+`)
  const toggleHotkey = process.platform === 'darwin' ? 'cmd+`' : 'ctrl+`';
  globalShortcut.register(toggleHotkey, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    globalShortcut.unregister(toggleHotkey);
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    // Start database first
    await startDatabase();
    dbStarted = true;
    // Register IPC handlers
    registerDbHandlers();
    // Create window
    createWindow();
    // Set window for IPC broadcasting
    setMainWindow(mainWindow);
    // Start file watcher for live updates
    const db = getDatabase();
    startObjectsWatcher(db, (objects) => {
      broadcastObjectsChanged(objects);
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
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
