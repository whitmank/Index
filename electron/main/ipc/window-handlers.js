// Author: Claude Code (Anthropic)
// IPC handlers for window behavior profile management

import { ipcMain } from 'electron';
import { loadWindowSettings, saveWindowSettings } from '../config/window-settings.js';
import { loadAppearanceSettings, saveAppearanceSettings } from '../config/appearance-settings.js';

const VALID_PROFILES = ['overlay', 'window'];

let onProfileChange = null;

/**
 * Set the callback invoked when the user switches profiles.
 * index.js provides this to trigger window recreation.
 * @param {Function} callback - async (profile: string) => void
 */
export function setProfileChangeCallback(callback) {
  onProfileChange = callback;
}

export function registerWindowHandlers() {
  ipcMain.handle('appearance:get', () => loadAppearanceSettings());

  ipcMain.on('appearance:set', (event, values) => saveAppearanceSettings(values));

  ipcMain.handle('window:getProfile', () => {
    return loadWindowSettings().profile;
  });

  ipcMain.handle('window:setProfile', async (event, profile) => {
    if (!VALID_PROFILES.includes(profile)) {
      return { success: false, error: `Invalid profile: ${profile}` };
    }
    try {
      saveWindowSettings({ profile });
      if (onProfileChange) {
        await onProfileChange(profile);
      }
      return { success: true };
    } catch (error) {
      console.error('[WindowHandlers] setProfile error:', error);
      return { success: false, error: error.message };
    }
  });
}
