import { ipcMain } from 'electron';
import { getDeviceId, getDeviceOrigin, isDeviceNamed } from '../config/device.js';
import { ensureDeviceNamed } from '../windows/device-naming-dialog.js';

// Author: Claude Code
// IPC handlers for device identification

/**
 * Ensure device is named (shows dialog if needed)
 * Called on app startup before rendering main window
 */
ipcMain.handle('device:ensureNamed', async () => {
  return await ensureDeviceNamed();
});

/**
 * Get current device's origin (user-friendly name)
 * Used by frontend for context and filtering
 */
ipcMain.handle('device:getOrigin', async () => {
  return await getDeviceOrigin();
});

/**
 * Get device ID (internal UUID)
 * Used for debugging/logging
 */
ipcMain.handle('device:getId', async () => {
  return await getDeviceId();
});

/**
 * Check if device is named
 */
ipcMain.handle('device:isNamed', async () => {
  return await isDeviceNamed();
});
