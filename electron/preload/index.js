const { contextBridge, ipcRenderer } = require('electron');
const CHANNELS = require('../main/ipc/channels');

/**
 * Preload script - Securely exposes Electron APIs to renderer process
 * Uses contextBridge to prevent prototype pollution attacks
 */

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  selectDirectory: () => ipcRenderer.invoke(CHANNELS.SELECT_DIRECTORY),
  selectFile: () => ipcRenderer.invoke(CHANNELS.SELECT_FILE),
  selectPaths: () => ipcRenderer.invoke(CHANNELS.SELECT_PATHS),
  getFileMetadata: (path) => ipcRenderer.invoke(CHANNELS.GET_FILE_METADATA, path),

  // File watching
  watchPath: (path) => ipcRenderer.invoke(CHANNELS.WATCH_PATH, path),
  unwatchPath: (path) => ipcRenderer.invoke(CHANNELS.UNWATCH_PATH, path),

  // Event listeners for file changes
  onFileChanged: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on(CHANNELS.FILE_CHANGED, subscription);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(CHANNELS.FILE_CHANGED, subscription);
    };
  },

  onDirectoryChanged: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on(CHANNELS.DIRECTORY_CHANGED, subscription);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(CHANNELS.DIRECTORY_CHANGED, subscription);
    };
  },

  // App paths
  getAppPath: () => ipcRenderer.invoke(CHANNELS.GET_APP_PATH),
  getUserDataPath: () => ipcRenderer.invoke(CHANNELS.GET_USER_DATA_PATH),

  // Window operations
  setWindowTitle: (title) => ipcRenderer.invoke(CHANNELS.SET_WINDOW_TITLE, title)
});

// Log that preload script has loaded
console.log('✅ Preload script loaded - electronAPI exposed');
