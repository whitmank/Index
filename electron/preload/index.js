// Author: Claude Code
// Preload — v0.4.
// Added: onObjectsLive, onTagAssignmentsLive, onCollectionsLive for LIVE SELECT reactivity.
// Added: db.getTagTypes to fetch system tag registry once on mount.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Device identification
  device: {
    ensureNamed: () => ipcRenderer.invoke('device:ensureNamed'),
    getOrigin: () => ipcRenderer.invoke('device:getOrigin'),
    getId: () => ipcRenderer.invoke('device:getId'),
    isNamed: () => ipcRenderer.invoke('device:isNamed'),
    submitName: (name) => ipcRenderer.send('device:submit-name', name),
  },

  // Database operations
  db: {
    getAll: (table) => ipcRenderer.invoke('db:getAll', table),
    getTagTypes: () => ipcRenderer.invoke('db:getTagTypes'),
    createObject: (data) => ipcRenderer.invoke('db:createObject', data),
    updateObject: (id, data) => ipcRenderer.invoke('db:updateObject', id, data),
    deleteObject: (id) => ipcRenderer.invoke('db:deleteObject', id),
    createTag: (data) => ipcRenderer.invoke('db:createTag', data),
    assignTag: (objectId, tagId) => ipcRenderer.invoke('db:assignTag', objectId, tagId),
    unassignTag: (objectId, tagId) => ipcRenderer.invoke('db:unassignTag', objectId, tagId),
    getTagsForObject: (objectId) => ipcRenderer.invoke('db:getTagsForObject', objectId),
    getObjectsForTag: (tagId) => ipcRenderer.invoke('db:getObjectsForTag', tagId),
    updateTag: (id, data) => ipcRenderer.invoke('db:updateTag', id, data),
    deleteTag: (id) => ipcRenderer.invoke('db:deleteTag', id),
    createCollection: (data) => ipcRenderer.invoke('db:createCollection', data),
    updateCollection: (id, data) => ipcRenderer.invoke('db:updateCollection', id, data),
    deleteCollection: (id) => ipcRenderer.invoke('db:deleteCollection', id),
    evaluateCollection: (id) => ipcRenderer.invoke('db:evaluateCollection', id),
    findOrCreateSystemTag: (type, name) => ipcRenderer.invoke('db:findOrCreateSystemTag', type, name),
  },

  // File system operations
  fs: {
    pickFile: () => ipcRenderer.invoke('fs:pickFile'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },

  // LIVE SELECT channels — call once on mount; removeAllListeners prevents accumulation
  onObjectsLive: (callback) => {
    ipcRenderer.removeAllListeners('live:objects');
    ipcRenderer.on('live:objects', (_e, data) => callback(data));
  },
  onTagAssignmentsLive: (callback) => {
    ipcRenderer.removeAllListeners('live:tagAssignments');
    ipcRenderer.on('live:tagAssignments', (_e, data) => callback(data));
  },
  onCollectionsLive: (callback) => {
    ipcRenderer.removeAllListeners('live:collections');
    ipcRenderer.on('live:collections', (_e, data) => callback(data));
  },

  // Capture: select a specific object in the UI
  onSelectObject: (callback) => {
    ipcRenderer.removeAllListeners('objects:selectObject');
    ipcRenderer.on('objects:selectObject', (_event, id) => callback(id));
  },

  // Open file or URL
  openSource: (source) => ipcRenderer.invoke('app:openSource', source),

  // Window behavior profile
  window: {
    getProfile: () => ipcRenderer.invoke('window:getProfile'),
    setProfile: (profile) => ipcRenderer.invoke('window:setProfile', profile),
  },
});
