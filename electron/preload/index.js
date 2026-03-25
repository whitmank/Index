// Author: Claude Code
// Preload — exposes window.electronAPI via contextBridge.
// Covers: device identity, database CRUD + edge operations, LIVE SELECT channels,
//         file system, window profile, and active space reporting.

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
    findOrCreateSystemTag: (type, name) => ipcRenderer.invoke('db:findOrCreateSystemTag', type, name),
    // Space operations
    createSpace: (data) => ipcRenderer.invoke('db:createSpace', data),
    updateSpace: (id, data) => ipcRenderer.invoke('db:updateSpace', id, data),
    evaluateSpace: (id) => ipcRenderer.invoke('db:evaluateSpace', id),
    // Edge operations
    addContains: (parentId, childId, order) => ipcRenderer.invoke('db:addContains', parentId, childId, order),
    removeContains: (parentId, childId) => ipcRenderer.invoke('db:removeContains', parentId, childId),
    isContainedBy: (parentId, childId) => ipcRenderer.invoke('db:isContainedBy', parentId, childId),
    addExcludes: (parentId, childId) => ipcRenderer.invoke('db:addExcludes', parentId, childId),
    removeExcludes: (parentId, childId) => ipcRenderer.invoke('db:removeExcludes', parentId, childId),
    // Tag type management
    createTagType: (data) => ipcRenderer.invoke('db:createTagType', data),
    updateTagType: (typeId, data) => ipcRenderer.invoke('db:updateTagType', typeId, data),
    deleteTagType: (typeId) => ipcRenderer.invoke('db:deleteTagType', typeId),
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
  onTaggedLive: (callback) => {
    ipcRenderer.removeAllListeners('live:tagged');
    ipcRenderer.on('live:tagged', (_e, data) => callback(data));
  },
  onContainsLive: (callback) => {
    ipcRenderer.removeAllListeners('live:contains');
    ipcRenderer.on('live:contains', (_e, data) => callback(data));
  },
  onExcludesLive: (callback) => {
    ipcRenderer.removeAllListeners('live:excludes');
    ipcRenderer.on('live:excludes', (_e, data) => callback(data));
  },
  onTagDefinitionsLive: (callback) => {
    ipcRenderer.removeAllListeners('live:tag_definitions');
    ipcRenderer.on('live:tag_definitions', (_e, data) => callback(data));
  },
  onTypedLive: (callback) => {
    ipcRenderer.removeAllListeners('live:typed');
    ipcRenderer.on('live:typed', (_e, data) => callback(data));
  },

  // Active space reporting — called by the store whenever the active space changes
  app: {
    setActiveSpace: (spaceId) => ipcRenderer.send('app:setActiveSpace', spaceId),
  },

  // Open file or URL
  openSource: (source) => ipcRenderer.invoke('app:openSource', source),

  // Window behavior profile
  window: {
    getProfile: () => ipcRenderer.invoke('window:getProfile'),
    setProfile: (profile) => ipcRenderer.invoke('window:setProfile', profile),
  },
});
