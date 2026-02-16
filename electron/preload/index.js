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
    assignTag: (objectId, tagId) => ipcRenderer.invoke('db:assignTag', objectId, tagId),
    unassignTag: (objectId, tagId) => ipcRenderer.invoke('db:unassignTag', objectId, tagId),
    getTagsForObject: (objectId) => ipcRenderer.invoke('db:getTagsForObject', objectId),
    getObjectsForTag: (tagId) => ipcRenderer.invoke('db:getObjectsForTag', tagId),
    updateTag: (id, data) => ipcRenderer.invoke('db:updateTag', id, data),
    deleteTag: (id) => ipcRenderer.invoke('db:deleteTag', id),
    getTagTypes: () => ipcRenderer.invoke('db:getTagTypes'),
    createTagType: (data) => ipcRenderer.invoke('db:createTagType', data),
    deleteTagType: (id) => ipcRenderer.invoke('db:deleteTagType', id),
    createCollection: (data) => ipcRenderer.invoke('db:createCollection', data),
    updateCollection: (id, data) => ipcRenderer.invoke('db:updateCollection', id, data),
    deleteCollection: (id) => ipcRenderer.invoke('db:deleteCollection', id),
    evaluateCollection: (id) => ipcRenderer.invoke('db:evaluateCollection', id),
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
