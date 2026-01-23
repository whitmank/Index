import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { registry, fileHandler } from '@index/source-handlers';
import { registerIpcHandlers, cleanupWatchers } from './ipc/handlers';
import { isDev } from './utils/env';

let mainWindow: BrowserWindow | null = null;

function initializeSourceHandlers(): void {
  console.log('[main] Initializing source handlers...');

  // Register file handler
  registry.register(fileHandler);

  console.log('[main] Source handlers initialized');
  console.log('[main] Available schemes:', registry.getSchemes());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Initialize source handler registry
  initializeSourceHandlers();

  // Register IPC handlers
  registerIpcHandlers();

  // Create main window
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  console.log('[main] Cleaning up watchers before quit...');
  cleanupWatchers();
  fileHandler.cleanup();
});
