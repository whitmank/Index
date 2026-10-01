// Author: Claude Sonnet 4.6
// Preload — exposes window.electronAPI via contextBridge.
// Covers: nodes, edge_types, edges CRUD; LIVE SELECT channels;
//         file system, window profile, appearance settings.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    // Nodes
    getAllNodes:    ()           => ipcRenderer.invoke('db:getAllNodes'),
    createNode:    (data)       => ipcRenderer.invoke('db:createNode', data),
    updateNode:    (id, data)   => ipcRenderer.invoke('db:updateNode', id, data),
    deleteNode:    (id)         => ipcRenderer.invoke('db:deleteNode', id),

    // Edge types
    getAllEdgeTypes:  ()       => ipcRenderer.invoke('db:getAllEdgeTypes'),
    createEdgeType:  (data)   => ipcRenderer.invoke('db:createEdgeType', data),
    deleteEdgeType:  (id)     => ipcRenderer.invoke('db:deleteEdgeType', id),

    // Edges
    getAllEdges:      ()           => ipcRenderer.invoke('db:getAllEdges'),
    createEdge:      (data)       => ipcRenderer.invoke('db:createEdge', data),
    deleteEdge:      (id)         => ipcRenderer.invoke('db:deleteEdge', id),
    getEdgesForNode: (nodeId)     => ipcRenderer.invoke('db:getEdgesForNode', nodeId),
    getEdgesByType:  (typeId)     => ipcRenderer.invoke('db:getEdgesByType', typeId),

    // Group contents
    getGroupContents: (groupId)         => ipcRenderer.invoke('db:getGroupContents', groupId),
    addToGroup:       (groupId, nodeId) => ipcRenderer.invoke('db:addToGroup', groupId, nodeId),
    removeFromGroup:  (groupId, nodeId) => ipcRenderer.invoke('db:removeFromGroup', groupId, nodeId),
  },

  // File system
  fs: {
    pickFile:       ()                 => ipcRenderer.invoke('fs:pickFile'),
    getPathForFile: (file)             => webUtils.getPathForFile(file),
    readFolder:     (folderPath)       => ipcRenderer.invoke('fs:readFolder', folderPath),
    thumbnail:      (filePath, size)   => ipcRenderer.invoke('fs:thumbnail', filePath, size),
    epubCover:      (filePath, size)   => ipcRenderer.invoke('fs:epubCover', filePath, size),
    readFile:       (filePath)         => ipcRenderer.invoke('fs:readFile', filePath),
  },

  // LIVE SELECT channels
  onNodesLive:     (cb) => { ipcRenderer.removeAllListeners('live:nodes');      ipcRenderer.on('live:nodes',      (_e, d) => cb(d)); },
  onEdgeTypesLive: (cb) => { ipcRenderer.removeAllListeners('live:edge_types'); ipcRenderer.on('live:edge_types', (_e, d) => cb(d)); },
  onEdgesLive:     (cb) => { ipcRenderer.removeAllListeners('live:edges');      ipcRenderer.on('live:edges',      (_e, d) => cb(d)); },

  // Active node reporting
  app: {
    setActiveNode: (nodeId) => ipcRenderer.send('app:setActiveNode', nodeId),
  },

  // Open file or URL
  openSource: (source) => ipcRenderer.invoke('app:openSource', source),

  // Window behavior profile
  window: {
    getProfile: () => ipcRenderer.invoke('window:getProfile'),
    setProfile: (profile) => ipcRenderer.invoke('window:setProfile', profile),
  },

  // Appearance
  appearance: {
    get: () => ipcRenderer.invoke('appearance:get'),
    set: (values) => ipcRenderer.send('appearance:set', values),
  },
});
