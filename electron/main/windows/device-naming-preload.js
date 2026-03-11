// Author: Claude Code
// Minimal preload for the device naming dialog window.
// Exposes only the single IPC channel needed to submit a device name.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dialogAPI', {
  submitName: (name) => ipcRenderer.send('device:submit-name', name),
});
