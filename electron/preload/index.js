const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Expose database IPC methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    query: (sql) => ipcRenderer.invoke('db:query', sql),
    mutate: (sql) => ipcRenderer.invoke('db:mutate', sql),
    getAll: (table) => ipcRenderer.invoke('db:getAll', table),
    createObject: (data) => ipcRenderer.invoke('db:createObject', data),
    updateObject: (id, data) => ipcRenderer.invoke('db:updateObject', id, data),
    createRelationship: (data) => ipcRenderer.invoke('db:createRelationship', data),
    createTag: (data) => ipcRenderer.invoke('db:createTag', data),
  },
  // File system operations
  fs: {
    pickFile: () => ipcRenderer.invoke('fs:pickFile'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  // File system listeners
  onObjectsChanged: (callback) => {
    ipcRenderer.on('objects:changed', () => callback());
  },
  // Open file or URL
  openSource: (source) => ipcRenderer.invoke('app:openSource', source),
  version: '0.1.0',
});
